# config.py
import os

import streamlit as st

# ==========================================
# 0. 核心配置API
# ==========================================
API_KEY = os.getenv("FRED_API_KEY", "")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")


# FRED Series IDs
SERIES_IDS = {
    'WALCL': 'WALCL', 'WTREGEN': 'WTREGEN', 'RRPONTSYD': 'RRPONTSYD', 'WRESBAL': 'WRESBAL',
    'DFF': 'DFF', 'SOFR': 'SOFR', 'IORB': 'IORB', 
    'RRPONTSYAWARD': 'RRPONTSYAWARD', 'TGCRRATE': 'TGCRRATE', 'RPONTSYD': 'RPONTSYD',
    'DGS1MO': 'DGS1MO', 'DGS3MO': 'DGS3MO', 'DGS6MO': 'DGS6MO', 'DGS1': 'DGS1', 'DGS2': 'DGS2', 
    'DGS3': 'DGS3', 'DGS5': 'DGS5', 'DGS7': 'DGS7', 'DGS10': 'DGS10', 'DGS20': 'DGS20', 'DGS30': 'DGS30',
    'T10Y2Y': 'T10Y2Y', 'T10Y3M': 'T10Y3M',
    'DFII10': 'DFII10', 'DFII5': 'DFII5', 'T10YIE': 'T10YIE',
    'INDPRO': 'INDPRO', 'PCEPILFE': 'PCEPILFE',
    'SP500': 'SP500',
    'CBBTCUSD': 'CBBTCUSD',
    'DTWEXBGS': 'DTWEXBGS',
    'DCOILWTICO': 'DCOILWTICO',   
    'DHHNGSP': 'DHHNGSP',         
    'DEXJPUS': 'DEXJPUS',         
    'IRSTCI01JPM156N': 'IRSTCI01JPM156N', 
    'VIXCLS': 'VIXCLS',             
    'VXVCLS': 'VXVCLS',             
    'BAMLH0A0HYM2': 'BAMLH0A0HYM2', 
    'BAA10Y': 'BAA10Y',
    
}

MACRO_INDICATORS = {
    'CPI': 'USCPI',          # 消费者物价指数
    'Core_CPI': 'USCPIC',    # 核心CPI
    'NFP': 'USNFP',          # 非农就业
    'Unemployment': 'USUR',  # 失业率
    'PCE': 'USPCE',          # PCE
    'Fed_Rate': 'USINTR',    # 联邦利率
    'GDP_Growth': 'USGDP',   # GDP增长率
    'Initial_Claims': 'USIJC' # 初请失业金
}

# CSS 样式
CSS_STYLE = """
<style>
    :root {
        --ui-bg: #f8f9fa;
        --ui-card: #ffffff;
        --ui-border: #e5e7eb;
        --ui-text: #111827;
        --ui-subtext: #6b7280;
        --ui-accent: #2563eb;
        --ui-success: #059669;
        --ui-danger: #dc2626;
        --ui-warn: #f59e0b;
    }

    /* 1. 核心大卡片 (白底 + 阴影) */
    .metric-card {
        background-color: var(--ui-card);
        border: 1px solid var(--ui-border);
        padding: 20px; 
        border-radius: 10px; 
        text-align: center;
        box-shadow: 0 2px 5px rgba(0,0,0,0.05);
    }
    .metric-value {font-size: 27px; font-weight: bold; color: var(--ui-text);}
    .metric-label {font-size: 15px; color: var(--ui-subtext);}
    
    /* 2. 细分小卡片 (浅灰底) */
    .sub-card {
        background-color: #f9fafb; 
        border: 1px solid var(--ui-border);
        padding: 15px; 
        border-radius: 8px; 
        text-align: center;
    }
    .sub-value {font-size: 21px; font-weight: bold; color: var(--ui-text);}
    .sub-label {font-size: 13px; color: var(--ui-subtext);}
    
    /* 3. 因子百科样式 */
    .glossary-box {
        background-color: #f3f4f6;
        padding: 18px;
        border-radius: 6px;
        margin-bottom: 15px;
        border-left: 4px solid #33CFFF;
        border: 1px solid var(--ui-border);
    }
    .glossary-title {
        font-weight: bold; color: #1f2937; font-size: 16px; margin-bottom: 8px; 
        border-bottom: 1px solid #e5e7eb; padding-bottom: 5px;
        letter-spacing: 0.5px;
    }
    .glossary-content {
        color: #374151; font-size: 14px; line-height: 1.6; margin-bottom: 8px;
    }
    .glossary-label { color: var(--ui-accent); font-weight: bold; font-size: 14px; }
    
    .logic-row {
        display: flex; justify-content: space-between; 
        background-color: var(--ui-card);
        padding: 8px 15px; border-radius: 4px; margin-top: 8px;
        font-size: 13px; font-weight: bold; border: 1px solid #e0e0e0;
    }
    .bullish { color: var(--ui-success); } 
    .bearish { color: var(--ui-danger); } 
    .neutral { color: #888; font-style: italic; }

    /* Tabs 美化 (加大字体版)  */
    button[data-baseweb="tab"] { 
        font-size: 18px !important; 
        font-weight: 700 !important;
        padding: 10px 24px !important;
        color: #888 !important; 
    }
    button[data-baseweb="tab"][aria-selected="true"] { 
        color: #000 !important; 
        font-weight: 900 !important;
        border-bottom: none !important; 
    }
    [data-testid="stMetricValue"] { font-size: 24px; color: #333 !important; }

    /* 顶部标题与AI按钮 */
    .page-title { font-size: 40px; font-weight: 800; color: #111827; margin-bottom: 6px; }
    .page-subtle { color: #6b7280; font-size: 13px; letter-spacing: .4px; }

    /* 顶部工具栏：保留侧边栏按钮，弱化背景 */
    header[data-testid="stHeader"] {
        background: #f8f9fa;
        box-shadow: none;
        border-bottom: 1px solid #e5e7eb;
        height: 40px;
    }
    header [data-testid="stToolbar"] {
        padding: 0 10px;
        height: 40px;
    }
    header [data-testid="stToolbarActions"] {
        display: none;
    }
    header button[kind="header"] {
        color: #6b7280;
    }

    /* 顶部导航：仿 Tabs */
    .top-nav {
        border-bottom: 1px solid #e5e7eb;
        padding-bottom: 10px;
        margin-bottom: 14px;
    }
    .top-nav [data-testid="stRadio"] > div {
        flex-direction: row !important;
        gap: 34px;
        flex-wrap: wrap;
    }
    .top-nav [data-testid="stRadio"] label {
        margin: 0 !important;
        cursor: pointer;
        display: flex;
        align-items: center;
    }
    .top-nav [data-testid="stRadio"] label input {
        display: none !important;
    }
    .top-nav [data-testid="stRadio"] label svg {
        display: none !important;
    }
    .top-nav [data-testid="stRadio"] label > div:first-child {
        display: none !important;
    }
    .top-nav [data-testid="stRadio"] label > div:last-child,
    .top-nav [data-testid="stRadio"] label span {
        position: relative;
        padding: 12px 2px;
        font-size: 18px;
        font-weight: 700;
        color: #6b7280;
        letter-spacing: 0.25px;
    }
    .top-nav [data-testid="stRadio"] label > div:last-child::after,
    .top-nav [data-testid="stRadio"] label span::after {
        content: "";
        position: absolute;
        left: 30%;
        bottom: -9px;
        width: 40%;
        height: 2px;
        background: transparent;
        border-radius: 2px;
        transition: all 0.2s ease;
    }
    .top-nav [data-testid="stRadio"] label input:checked + div,
    .top-nav [data-testid="stRadio"] label input:checked + span,
    .top-nav [data-testid="stRadio"] label input:checked ~ div:last-child,
    .top-nav [data-testid="stRadio"] label input:checked ~ span {
        color: #111827;
        font-weight: 800;
    }
    .top-nav [data-testid="stRadio"] label input:checked + div::after,
    .top-nav [data-testid="stRadio"] label input:checked + span::after,
    .top-nav [data-testid="stRadio"] label input:checked ~ div:last-child::after,
    .top-nav [data-testid="stRadio"] label input:checked ~ span::after {
        background: #ef4444;
    }

    /* Primary 按钮：更和谐的卡片风 */
    button[kind="primary"] {
        background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%) !important;
        border: 1px solid #cbd5e1 !important;
        color: #1f2937 !important;
        border-radius: 10px !important;
        font-weight: 700 !important;
        box-shadow: 0 6px 16px rgba(15,23,42,0.08) !important;
        backdrop-filter: blur(8px);
    }
    button[kind="primary"]:hover {
        filter: brightness(1.03);
        box-shadow: 0 10px 28px rgba(15,23,42,0.14) !important;
    }
    button[kind="primary"]:focus {
        box-shadow: 0 0 0 3px rgba(37,99,235,0.2) !important;
    }

    /* 顶部 AI 跳转按钮 */
    .jump-ai-btn-wrap { display: flex; justify-content: flex-end; }
    .jump-ai-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 170px;
        padding: 8px 12px;
        border-radius: 10px;
        background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
        border: 1px solid #cbd5e1;
        color: #111827 !important;
        font-weight: 600;
        text-decoration: none !important;
        box-shadow: 0 6px 16px rgba(15,23,42,0.08);
    }
    .jump-ai-btn:link,
    .jump-ai-btn:visited,
    .jump-ai-btn:active {
        color: #111827 !important;
        text-decoration: none !important;
    }
    .jump-ai-btn:hover {
        color: #111827 !important;
        font-weight: 800;
        text-decoration: none !important;
        box-shadow: 0 8px 20px rgba(15,23,42,0.12);
    }
    .jump-ai-btn:hover { box-shadow: 0 8px 20px rgba(15,23,42,0.12); }

    /* 侧边栏导航（卡片导航，无圆圈） */
    section[data-testid="stSidebar"] {
        background: #e5e7eb;
    }
    section[data-testid="stSidebar"] .stButton > button {
        width: 100%;
        text-align: left;
        padding: 12px 16px;
        border-radius: 14px;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        box-shadow: 0 2px 6px rgba(15,23,42,0.05);
        color: #475569;
        font-weight: 600;
        font-size: 16px;
        letter-spacing: 0.2px;
    }
    section[data-testid="stSidebar"] .stButton > button:hover {
        transform: translateY(-1px);
        box-shadow: 0 8px 16px rgba(15,23,42,0.08);
        border-color: #d1d5db;
    }
    .nav-card {
        padding: 12px 16px;
        border-radius: 14px;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        box-shadow: 0 2px 6px rgba(15,23,42,0.05);
        margin-bottom: 10px;
    }
    .nav-card.active {
        background: linear-gradient(180deg, #eef2ff 0%, #ffffff 100%);
        border-color: #c7d2fe;
        box-shadow: 0 10px 18px rgba(37,99,235,0.12);
    }
    .nav-card-title {
        font-size: 16px;
        font-weight: 600;
        color: #475569;
        letter-spacing: 0.2px;
    }
    .nav-card.active .nav-card-title {
        color: #1e293b;
        font-weight: 700;
    }

    @media (max-width: 1200px) {
        button[data-baseweb="tab"] { 
            font-size: 16px !important;
            padding: 8px 16px !important;
        }
        .metric-card { padding: 16px; }
        .metric-value { font-size: 22px; }
    }
</style>
"""
