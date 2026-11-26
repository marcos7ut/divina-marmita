/** Formata número como moeda brasileira. */
export const brl = (n) => 'R$ ' + (Math.round(Number(n) * 100) / 100).toFixed(2).replace('.', ',');
/** Arredonda para centavos sem erro de ponto flutuante. */
export const cents = (n) => Math.round(Number(n) * 100) / 100;
