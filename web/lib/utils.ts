import { clsx, type ClassValue } from "clsx";

export const cn = (...inputs: ClassValue[]) => clsx(inputs);

export const formatSigned = (value: number, digits = 1) => {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toFixed(digits)}`;
};

export const scoreTone = (score: number) => {
  if (score >= 60) {
    return { text: "text-app-success", bar: "bg-app-success" };
  }
  if (score >= 40) {
    return { text: "text-app-warning", bar: "bg-app-warning" };
  }
  return { text: "text-app-danger", bar: "bg-app-danger" };
};

export const describeScoreState = (score: number) => {
  if (score >= 75) {
    return {
      label: "极松",
      hint: "风险偏好明显回暖",
      state: "positive" as const,
    };
  }
  if (score >= 60) {
    return {
      label: "偏松",
      hint: "金融条件偏宽松",
      state: "positive" as const,
    };
  }
  if (score >= 45) {
    return {
      label: "中性",
      hint: "处于均衡区间",
      state: "neutral" as const,
    };
  }
  if (score >= 30) {
    return {
      label: "偏紧",
      hint: "流动性边际偏紧",
      state: "negative" as const,
    };
  }
  return {
    label: "极紧",
    hint: "风险约束显著抬升",
    state: "negative" as const,
  };
};
