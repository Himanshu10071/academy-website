const rupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

export function formatPrice(pricePaise: number) {
  return rupees.format(pricePaise / 100);
}

export function formatDuration(seconds: number | null) {
  if (seconds === null) return "Duration unavailable";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
