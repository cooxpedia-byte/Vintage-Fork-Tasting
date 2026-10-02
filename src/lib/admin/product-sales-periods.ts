import { salesPeriodRange, yesterdaySalesRange, type SalesPeriodRange } from "./sales-periods";

export const PRODUCT_SALES_PERIODS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_week", label: "Last week" },
  { value: "month_to_date", label: "Month to date" },
  { value: "last_month", label: "Last month" },
  { value: "year_to_date", label: "Year to date" },
] as const;

export type ProductSalesPeriod = (typeof PRODUCT_SALES_PERIODS)[number]["value"];
export const DEFAULT_PRODUCT_SALES_PERIOD: ProductSalesPeriod = "month_to_date";

export function parseProductSalesPeriod(value: unknown): ProductSalesPeriod {
  return typeof value === "string" && PRODUCT_SALES_PERIODS.some(period => period.value === value)
    ? value as ProductSalesPeriod
    : DEFAULT_PRODUCT_SALES_PERIOD;
}

export function productSalesPeriodRange(period: ProductSalesPeriod, now = new Date()): SalesPeriodRange {
  if (period === "yesterday") return yesterdaySalesRange(now);
  return salesPeriodRange(period === "today" ? "day" : period, now);
}
