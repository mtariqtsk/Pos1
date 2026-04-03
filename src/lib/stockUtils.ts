export const formatStock = (totalUnits: number, unitsPerCarton: number) => {
  if (!unitsPerCarton || unitsPerCarton <= 0) return `${totalUnits} Pcs`;
  
  const cartons = Math.floor(totalUnits / unitsPerCarton);
  const pieces = totalUnits % unitsPerCarton;
  
  const parts = [];
  if (cartons > 0) parts.push(`${cartons} Ctn`);
  if (pieces > 0 || parts.length === 0) parts.push(`${pieces} Pcs`);
  
  return parts.join(', ');
};

export const parseStockInput = (cartons: number, pieces: number, unitsPerCarton: number) => {
  return (cartons * unitsPerCarton) + pieces;
};
