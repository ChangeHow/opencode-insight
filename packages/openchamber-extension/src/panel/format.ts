export const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
export const number = (value: number) =>
  new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(value);
export const time = (value: number) => new Date(value).toLocaleTimeString("en", { hour12: false });
export const duration = (value: number) =>
  value > 0 && value < 1000 ? `${number(value)} ms` : `${number(value / 1000)} s`;
export const money = (value: number) =>
  value > 0 && value < 0.000001
    ? "$<0.000001"
    : new Intl.NumberFormat("en", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 6,
      }).format(value);
