export function formatKoreanMoney(
  value: number | string
): string {
  const amount =
    typeof value === "string"
      ? Number(value)
      : value;

  if (!Number.isFinite(amount)) {
    return "0원";
  }

  const units = [
    { value: 1e20, label: "해" },
    { value: 1e16, label: "경" },
    { value: 1e12, label: "조" },
    { value: 1e8, label: "억" },
    { value: 1e4, label: "만" },
  ];

  for (const unit of units) {
    if (Math.abs(amount) >= unit.value) {
      const divided = amount / unit.value;

      const digits =
        Math.abs(divided) >= 100
          ? 0
          : Math.abs(divided) >= 10
            ? 1
            : 2;

      return `${Number(
        divided.toFixed(digits)
      ).toLocaleString()}${unit.label} 원`;
    }
  }

  return `${Math.floor(amount).toLocaleString()}원`;
}
