export function buildActiveJobFilter() {
  return {
    isActive: true,
    $or: [
      { expiryDate: null },
      { expiryDate: { $gte: new Date() } },
    ],
  }
}
