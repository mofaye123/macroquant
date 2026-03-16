"""Execution freshness guard for macro signals."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Optional

from .config import DEFAULT_ENGINE_CONFIG


def _deep_merge(base: dict[str, Any], override: Optional[dict[str, Any]]) -> dict[str, Any]:
    out = deepcopy(base)
    if not override:
        return out
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = _deep_merge(out[key], value)
        else:
            out[key] = value
    return out


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


def _parse_date(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value)).replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def evaluate_macro_signal_guard(
    strategy_payload: dict[str, Any],
    *,
    config: Optional[dict[str, Any]] = None,
    now: Optional[datetime] = None,
) -> dict[str, Any]:
    cfg = _deep_merge(DEFAULT_ENGINE_CONFIG, config)
    guard_cfg = cfg["macro_signal_guard"]
    macro_signal = strategy_payload.get("macroSignal") or {}
    data_quality = macro_signal.get("dataQuality") or {}
    current = now.astimezone(timezone.utc) if now is not None else datetime.now(timezone.utc)

    source_type = str(macro_signal.get("sourceType") or "unavailable")
    generated_at = _parse_iso(macro_signal.get("generatedAt"))
    score_date = _parse_date(macro_signal.get("scoreDate"))
    age_hours = (current - generated_at).total_seconds() / 3600.0 if generated_at else None
    score_age_days = (current - score_date).total_seconds() / 86400.0 if score_date else None
    ready_modules = list(data_quality.get("readyModules") or [])
    reasons: list[dict[str, str]] = []

    if not macro_signal:
        reasons.append({"code": "MACRO_SIGNAL_MISSING", "message": "没有接到宏观信号 payload。"})

    allowed_source_types = list(guard_cfg.get("allowed_source_types") or ["live_builder"])
    if guard_cfg.get("require_live_builder_for_execution", False) and source_type not in set(allowed_source_types):
        reasons.append(
            {
                "code": "MACRO_SIGNAL_NOT_LIVE",
                "message": f"当前宏观信号源为 {source_type}，不在允许的实时宏观源列表内。",
            }
        )

    if generated_at is None:
        reasons.append({"code": "MACRO_SIGNAL_NO_TIMESTAMP", "message": "宏观信号缺少生成时间。"})
    elif age_hours is not None and age_hours > float(guard_cfg["max_generated_age_hours"]):
        reasons.append(
            {
                "code": "MACRO_SIGNAL_STALE",
                "message": f"宏观信号生成时间距今 {age_hours:.1f} 小时，超过阈值 {float(guard_cfg['max_generated_age_hours']):.1f} 小时。",
            }
        )

    if score_date is None:
        reasons.append({"code": "MACRO_SCORE_DATE_MISSING", "message": "宏观总分缺少得分日期。"})
    elif score_age_days is not None and score_age_days > float(guard_cfg["max_score_age_days"]):
        reasons.append(
            {
                "code": "MACRO_SCORE_STALE",
                "message": f"宏观总分日期距今 {score_age_days:.2f} 天，超过阈值 {float(guard_cfg['max_score_age_days']):.2f} 天。",
            }
        )

    if len(ready_modules) < int(guard_cfg["min_ready_modules"]):
        reasons.append(
            {
                "code": "MACRO_MODULES_INCOMPLETE",
                "message": f"宏观模块就绪数量为 {len(ready_modules)}，低于要求的 {int(guard_cfg['min_ready_modules'])} 个。",
            }
        )

    if str(data_quality.get("mode") or "unknown") not in set(guard_cfg["allowed_data_quality_modes"]):
        reasons.append(
            {
                "code": "MACRO_DATA_QUALITY_BLOCK",
                "message": f"宏观数据质量模式为 {data_quality.get('mode') or 'unknown'}，不在允许列表内。",
            }
        )

    execution_allowed = len(reasons) == 0
    return {
        "status": "ready" if execution_allowed else "blocked",
        "executionAllowed": execution_allowed,
        "sourceType": source_type,
        "generatedAt": macro_signal.get("generatedAt"),
        "scoreDate": macro_signal.get("scoreDate"),
        "ageHours": round(float(age_hours), 2) if age_hours is not None else None,
        "scoreAgeDays": round(float(score_age_days), 3) if score_age_days is not None else None,
        "readyModules": ready_modules,
        "requiredReadyModules": int(guard_cfg["min_ready_modules"]),
        "maxGeneratedAgeHours": float(guard_cfg["max_generated_age_hours"]),
        "maxScoreAgeDays": float(guard_cfg["max_score_age_days"]),
        "requireLiveBuilder": bool(guard_cfg.get("require_live_builder_for_execution", False)),
        "allowedSourceTypes": allowed_source_types,
        "allowedDataQualityModes": list(guard_cfg["allowed_data_quality_modes"]),
        "reasons": reasons,
    }
