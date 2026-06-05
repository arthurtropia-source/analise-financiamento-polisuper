// =============================================================================
//  dados.js — CAMADA DE DADOS / PREMISSAS DA OPERAÇÃO FEIRA NOVA
// -----------------------------------------------------------------------------
//  Operação: compra de 3 PONTOS DE VENDA de supermercado (fundo de comércio,
//  sem os imóveis) por R$ 50M, financiada em duas tranches:
//    - TRANCHE_BANCO    : R$ 25M via empréstimo Santander (substituível pelo consórcio)
//    - TRANCHE_VENDEDOR : R$ 25M em parcelas fixas ao ex-proprietário (sempre presente)
//  As 3 lojas geram caixa livre desde jan/2026 (ATIVO), que abate o custo financeiro.
//
//  Todos os números editáveis na tela têm seu DEFAULT aqui. Calibrar conforme
//  os dados reais forem confirmados (marcados com TODO CALIBRAR).
// =============================================================================

// Eixo de tempo único: mês 0 = jan/2026. Todos os fluxos são ancorados aqui.
const DATA_BASE = { ano: 2026, mes: 1, label: 'jan/2026' };

// =============================================================================
//  CONSÓRCIO — fluxo real da planilha "FEIRA NOVA (1).xlsm" (linha 220, SEM reajuste)
// =============================================================================
const FLUXO_SEM_REAJUSTE = [656491.92,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,374128.33,368918.14,363790.23,354020.49,306740.3,270361.03,226163.42,186110.88,162180.98,134078.51,118777.95,107081.31,107081.31,97485.19,97485.19,97485.19,97485.19,97485.19,89555.21,78360.36,78360.36,78360.36,78360.36,78360.36,78360.36,78360.36,78360.36,76376.29,74388.95,72473.66,72473.66,64832.67,64832.67,64832.67,64832.67,64832.67,64832.67,64832.67,64832.67,64832.67,64832.67,63413.44,63413.44,63413.44,63413.44,63413.44,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,62126.56,61284.74,59933.24,58541.7,57188.23,55846.47,55061.06,54534.12,53263.86,53263.86,50648.87,50648.87,50160.18,49439.21,49439.21,46048.04,44628.88,41800.55,35930.39,35930.39,35930.39,35930.39,35930.39,35930.39,35930.39,35930.39,35930.39,35930.39,35930.39,34118.68,34118.68,32048.11,30621.13,29392.3,27367.42,27367.42,24616.03,24616.03,24616.03,24616.03,24616.03,23790.37,22920.18,22920.18,22231.73,21801.77,21382.69,20890.0,20223.87,20223.87,19319.66,19319.66,18445.03,17572.55,17572.55,17335.33,15617.19,13746.0,12582.13,12582.13,12582.13,12582.13,12582.13,11746.62,8820.79,8820.79,8820.79,8820.79,8470.33,5611.58,5263.4,4852.3,4236.49,3552.39,3552.39,3231.07,3231.07,3231.07,2471.3,2471.3,1851.49,0.0,0.0,0.0,0.0,0.0,0.0,0.0];

// Premissas fixas do consórcio (FEIRA NOVA (1))
const PROP = {
  carta_total: 58890540.64,
  lance_proprio: 18238628.34,
  lance_embutido: 16977419.93,
  saldo_devedor_pos: 33145571.27,
  taxa_adm_pct: 0.1349,
  fundo_reserva_pct: 0.0371,
  parcela_inicial_cheia: 656491.92,
  seguro_adicional_pct: 0.108,
  prazo_max: 233,
};
PROP.credito_disponivel = PROP.carta_total - PROP.lance_embutido;
PROP.caixa_liquido = PROP.credito_disponivel - PROP.lance_proprio;

// =============================================================================
//  TRANCHE_BANCO — empréstimo Santander atual (R$ 25M). Substituível pelo consórcio.
//  (mantém o nome legado EMPRESTIMO como alias para reaproveitar a lógica existente)
// =============================================================================
const EMPRESTIMO = {
  carencia: 12,           // meses só de juros
  total_parcelas: 60,     // SAC, 60 meses
  spread_aa: 0.018,       // CDI + 1,80%
  valor_default: 25000000,
};
const TRANCHE_BANCO = EMPRESTIMO;

// =============================================================================
//  TRANCHE_VENDEDOR — parcelas fixas ao ex-proprietário (R$ 25M)
//  Sem indexador. Sempre presente, independente da escolha banco vs consórcio.
// =============================================================================
const TRANCHE_VENDEDOR = {
  valor_total: 25000000,
  parcela: 500000,        // R$ 500K/mês fixos
  total_parcelas: 50,     // 25M / 500K = 50x  (TODO CALIBRAR: confirmar nº exato)
  mes_inicio: 1,          // mês 1 = jan/2026  (TODO CALIBRAR)
  indexador: 'fixo',
};

// =============================================================================
//  ATIVO — as 3 lojas de supermercado. Caixa livre mensal abate o custo financeiro.
//  Não consta na planilha original: PREMISSA EDITÁVEL (placeholder até calibrar).
// =============================================================================
const ATIVO = {
  descricao: '3 pontos de venda de supermercado (fundo de comércio)',
  n_lojas: 3,
  // Caixa livre (lucro operacional após custos da própria loja) TOTAL por mês.
  // TODO CALIBRAR com o resultado real das lojas.
  caixa_livre_mensal: 800000,  // placeholder: R$ 800K/mês total (3 lojas)
  reajuste_aa: 0.05,           // crescimento/reajuste anual do caixa livre
  mes_inicio: 1,               // gerando caixa desde jan/2026
};

// =============================================================================
//  Premissas de mercado (defaults dos controles)
// =============================================================================
const MERCADO = {
  incc_aa: 0.0554,
  cdi_aa: 0.149,
  cdi_fut_aa: 0.10,
  ponte_spread_aa: 0.018,
};
