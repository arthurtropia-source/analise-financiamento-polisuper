// =============================================================================
//  calculos.js — FUNÇÕES PURAS DE CÁLCULO FINANCEIRO
//  Depende de dados.js (PROP, EMPRESTIMO/TRANCHE_BANCO, TRANCHE_VENDEDOR, ATIVO,
//  FLUXO_SEM_REAJUSTE). Não toca no DOM.
// =============================================================================

// ----------------------------- FORMATAÇÃO -----------------------------------
const brl = (v) => (v < 0 ? '−R$ ' : 'R$ ') + Math.abs(Math.round(v)).toLocaleString('pt-BR');
const brlMM = (v) => (v < 0 ? '−R$ ' : 'R$ ') + (Math.abs(v) / 1e6).toFixed(2) + ' mi';
const pct = (v) => (v * 100).toFixed(2).replace('.', ',') + '%';

function formatBRLshort(v) {
  const abs = Math.abs(v);
  if (abs >= 1e9) return (v < 0 ? '−' : '') + 'R$ ' + (abs / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return (v < 0 ? '−' : '') + 'R$ ' + (abs / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return (v < 0 ? '−' : '') + 'R$ ' + (abs / 1e3).toFixed(0) + 'K';
  return brl(v);
}

// Converte índice de array (0-based, mês 1 = jan/2026) para rótulo de calendário.
function mesLabel(idxMes1) {
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const offset = (idxMes1 - 1) + (DATA_BASE.mes - 1);
  const ano = DATA_BASE.ano + Math.floor(offset / 12);
  const mes = offset % 12;
  return nomes[mes] + '/' + String(ano).slice(2);
}

// ============================= CONSÓRCIO ====================================
function anoReajuste(mes) {
  if (mes < 12) return 0;
  return Math.floor((mes - 12) / 12) + 1;
}
function aplicarReajuste(fluxoBase, incc) {
  return fluxoBase.map((p, i) => p * Math.pow(1 + incc, anoReajuste(i + 1)));
}
function aplicarSeguro(fluxo, ativo) {
  const fator = ativo ? (1 + PROP.seguro_adicional_pct) : 1;
  return fluxo.map(p => p * fator);
}
function aplicarContempAtrasada(fluxo, mesContemp) {
  if (mesContemp <= 1) return [...fluxo];
  const novo = [];
  for (let i = 0; i < mesContemp - 1; i++) novo.push(PROP.parcela_inicial_cheia);
  for (let i = 0; i < fluxo.length; i++) novo.push(fluxo[i]);
  return novo;
}
function calcCustoPonte(mesContemp, cdi, ponteSpread) {
  const taxa_ponte_aa = cdi + ponteSpread;
  const taxa_ponte_am = Math.pow(1 + taxa_ponte_aa, 1 / 12) - 1;
  const valor_final = PROP.lance_proprio * Math.pow(1 + taxa_ponte_am, mesContemp);
  return valor_final - PROP.lance_proprio;
}
function buildFluxoConsorcio(inputs) {
  let parcelas = aplicarReajuste(FLUXO_SEM_REAJUSTE, inputs.incc);
  parcelas = aplicarSeguro(parcelas, inputs.seguro);
  parcelas = aplicarContempAtrasada(parcelas, inputs.contemp);

  const custo_ponte = calcCustoPonte(inputs.contemp, inputs.cdi, inputs.ponte_spread);
  // Custo do ponte distribuído mensalmente do mês 1 até o mês da contemplação,
  // em vez de lançado integralmente numa única parcela na contemplação.
  const custo_ponte_mensal = inputs.contemp >= 1 ? custo_ponte / inputs.contemp : 0;

  // Fluxo para TIR (ponto de vista do tomador): mês 0 = 0; no mês da contemplação
  // recebe caixa líquido − parcela; o custo do ponte é distribuído mês a mês
  // (do mês 1 até a contemplação); demais meses = −parcela.
  const fluxo = [0];
  for (let i = 0; i < parcelas.length; i++) {
    const mes = i + 1;
    const pontePonte = mes <= inputs.contemp ? custo_ponte_mensal : 0;
    if (mes === inputs.contemp) {
      fluxo.push(PROP.credito_disponivel - PROP.lance_proprio - pontePonte - parcelas[i]);
    } else {
      fluxo.push(-parcelas[i] - pontePonte);
    }
  }
  return { parcelas, fluxo, custo_ponte, custo_ponte_mensal };
}
function calcSaldoDevedorReal(parcelas) {
  const n = parcelas.length;
  const saldos = new Array(n + 1).fill(0);
  for (let t = n - 1; t >= 0; t--) saldos[t] = saldos[t + 1] + parcelas[t];
  return saldos;
}

// ====================== TRANCHE_BANCO (empréstimo) ==========================
function trajetoriaCDI(cdi0, cdiFinal, mes) {
  const meses_total = EMPRESTIMO.total_parcelas;
  if (mes >= meses_total) return cdiFinal;
  return cdi0 + (cdiFinal - cdi0) * (mes / meses_total);
}
function buildFluxoEmprestimo(principal, cdi0, cdiFinal, spread) {
  let saldo = principal;
  const fluxo = [principal];
  const parcelas = [0];
  const juros_arr = [0];
  const amort_arr = [0];
  const saldo_evol = [saldo];

  const amort_pos_carencia = principal / (EMPRESTIMO.total_parcelas - EMPRESTIMO.carencia + 1);

  for (let mes = 1; mes <= EMPRESTIMO.total_parcelas; mes++) {
    const cdi_mes = trajetoriaCDI(cdi0, cdiFinal, mes - 1);
    const taxa_am = Math.pow(1 + cdi_mes + spread, 1 / 12) - 1;
    const juros = saldo * taxa_am;
    const amortizacao = mes <= EMPRESTIMO.carencia ? 0 : amort_pos_carencia;
    const parcela = juros + amortizacao;
    saldo = Math.max(0, saldo - amortizacao);

    parcelas.push(parcela);
    juros_arr.push(juros);
    amort_arr.push(amortizacao);
    saldo_evol.push(saldo);
    fluxo.push(-parcela);
  }
  return {
    parcelas, fluxo, juros_arr, amort_arr, saldo_evol,
    total_pago: parcelas.reduce((a, b) => a + b, 0),
    total_juros: juros_arr.reduce((a, b) => a + b, 0),
  };
}

// ===================== TRANCHE_VENDEDOR (ex-proprietário) ====================
// Série de parcelas FIXAS no eixo de tempo único (índice 1 = jan/2026).
// Retorna array onde pos[m] = parcela paga no mês m (0 fora da janela).
function buildSerieVendedor(v) {
  const fim = v.mes_inicio + v.total_parcelas - 1;
  const serie = new Array(fim + 1).fill(0);
  for (let m = v.mes_inicio; m <= fim; m++) serie[m] = v.parcela;
  return serie;
}

// ============================ ATIVO (lojas) =================================
// Caixa livre mensal das lojas no eixo de tempo único, com reajuste anual.
function buildSerieAtivo(a, horizonte) {
  const serie = new Array(horizonte + 1).fill(0);
  for (let m = a.mes_inicio; m <= horizonte; m++) {
    const anos = Math.floor((m - a.mes_inicio) / 12);
    serie[m] = a.caixa_livre_mensal * Math.pow(1 + a.reajuste_aa, anos);
  }
  return serie;
}

// =========================== HELPERS FINANCEIROS ============================
function calcNPV(rate, flows) {
  let npv = 0;
  for (let t = 0; t < flows.length; t++) npv += flows[t] / Math.pow(1 + rate, t);
  return npv;
}
function calcIRR(flows) {
  let lo = -0.005, hi = 0.30;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const v_mid = calcNPV(mid, flows);
    const v_lo = calcNPV(lo, flows);
    if (Math.abs(v_mid) < 0.01) return mid;
    if (v_lo * v_mid < 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

// =========================== CONSOLIDAÇÃO DE CAIXA ==========================
// Soma todas as SAÍDAS de parcelas do cenário escolhido, alinhadas no eixo único,
// subtrai as ENTRADAS do ativo, e calcula fluxo líquido mensal, break-even e payback.
//
//  cenario: 'banco' | 'consorcio'
//  Retorna séries indexadas por mês (1 = jan/2026) até o horizonte.
function buildConsolidado(inputs, consorcioData, empData, cenario) {
  const serieVendedor = buildSerieVendedor(TRANCHE_VENDEDOR);

  // Saídas de financiamento (estrutura escolhida), ancoradas no mês 1 = início.
  let saidaFin;        // parcelas mensais da estrutura escolhida
  let pontePorMes;     // custo do ponte distribuído mês a mês até a contemplação (só consórcio)
  if (cenario === 'consorcio') {
    saidaFin = [0, ...consorcioData.parcelas];
    pontePorMes = new Array(saidaFin.length).fill(0);
    if (inputs.contemp >= 1) {
      const custoMensal = consorcioData.custo_ponte_mensal || 0;
      for (let m = 1; m <= inputs.contemp && m < pontePorMes.length; m++) {
        pontePorMes[m] += custoMensal;
      }
    }
  } else {
    saidaFin = [...empData.parcelas]; // já começa com [0, p1, ...]
    pontePorMes = new Array(saidaFin.length).fill(0);
  }

  const horizonte = Math.max(saidaFin.length - 1, serieVendedor.length - 1);
  const serieAtivo = buildSerieAtivo(ATIVO, horizonte);

  const meses = [], entrada = [], saidaParc = [], saidaVend = [],
        liquido = [], acumulado = [];
  let acum = 0, breakeven = null, payback = null;

  for (let m = 1; m <= horizonte; m++) {
    const ent = serieAtivo[m] || 0;
    const sFin = (saidaFin[m] || 0) + (pontePorMes[m] || 0);
    const sVend = serieVendedor[m] || 0;
    const liq = ent - sFin - sVend;
    acum += liq;

    meses.push(m);
    entrada.push(ent);
    saidaParc.push(sFin);
    saidaVend.push(sVend);
    liquido.push(liq);
    acumulado.push(acum);

    if (breakeven === null && liq >= 0 && m >= ATIVO.mes_inicio) breakeven = m;
    if (payback === null && acum >= 0 && m > 1) payback = m;
  }

  return {
    horizonte, meses, entrada, saidaParc, saidaVend, liquido, acumulado,
    breakeven, payback,
    total_entradas: entrada.reduce((a, b) => a + b, 0),
    total_saidas: saidaParc.reduce((a, b) => a + b, 0) + saidaVend.reduce((a, b) => a + b, 0),
    vendedor_total: serieVendedor.reduce((a, b) => a + b, 0),
  };
}
