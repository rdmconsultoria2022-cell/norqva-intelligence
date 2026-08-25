export function formatBRL(value: number | string): string {
  const parsed = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(parsed)) return 'R$ 0,00';
  return `R$ ${parsed.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
}

export function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR');
}
