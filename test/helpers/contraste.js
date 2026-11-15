// A razão de contraste da WCAG entre duas cores, como o navegador as devolve (getComputedStyle: "rgb(…)" ou
// "rgba(…)"; a transparência não entra na conta)
const canais = cor => {
  const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(cor);
  if (!m) throw new Error(`Cor fora do formato rgb(): ${cor}`);
  return [m[1], m[2], m[3]].map(Number);
};
const luminancia = cor => {
  const [r, g, b] = canais(cor).map(v => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export function razaoDeContraste(a, b) {
  const [clara, escura] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (clara + 0.05) / (escura + 0.05);
}
