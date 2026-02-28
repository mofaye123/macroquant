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
