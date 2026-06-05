// =============================================================================
//  painel.js — CAMADA DE APRESENTAÇÃO (DOM, inputs, charts, update)
//  Depende de dados.js e calculos.js.
// =============================================================================

// ============================= INPUTS =======================================
function getInputs() {
  const num = (id, def) => parseFloat(document.getElementById(id).value) || def;
  const int = (id, def) => parseInt(document.getElementById(id).value) || def;
  return {
    // consórcio / empréstimo
    incc: num('incc', 5.54) / 100,
    contemp: int('contemp', 1),
    seguro: document.getElementById('seguro').value === '1',
    cdi: num('cdi', 14.9) / 100,
    cdi_fut: num('cdi-fut', 10) / 100,
    ponte_spread: num('ponte-spread', 1.8) / 100,
    emp_valor: num('emp-valor', 25000000),
    // consolidado
    cenario: document.getElementById('cenario').value, // 'banco' | 'consorcio'
    ativo_caixa: num('ativo-caixa', 800000),
    ativo_reaj: num('ativo-reaj', 5) / 100,
    ativo_inicio: int('ativo-inicio', 1),
    vend_parcela: num('vend-parcela', 500000),
    vend_n: int('vend-n', 50),
    vend_inicio: int('vend-inicio', 1),
  };
}

// Sincroniza os objetos de dados editáveis com os inputs antes de calcular.
function aplicarInputsNosDados(inputs) {
  ATIVO.caixa_livre_mensal = inputs.ativo_caixa;
  ATIVO.reajuste_aa = inputs.ativo_reaj;
  ATIVO.mes_inicio = inputs.ativo_inicio;
  TRANCHE_VENDEDOR.parcela = inputs.vend_parcela;
  TRANCHE_VENDEDOR.total_parcelas = inputs.vend_n;
  TRANCHE_VENDEDOR.mes_inicio = inputs.vend_inicio;
}

// ============================= CHARTS =======================================
let charts = {};
function destroyCharts() {
  Object.values(charts).forEach(c => c.destroy());
  charts = {};
}
Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
Chart.defaults.font.size = 11;
Chart.defaults.color = '#374151';

// Plugin que desenha, dentro do corpo do gráfico, um marcador no fundo de cada
// curva (o "maior buraco de caixa") com um rótulo fixo (valor + mês) — visível
// sem precisar passar o mouse por cima.
function troughMarkersPlugin(troughs) {
  return {
    id: 'troughMarkers',
    afterDatasetsDraw(chart) {
      const { ctx, chartArea } = chart;
      troughs.forEach(t => {
        if (t.mesIndex == null) return;
        const meta = chart.getDatasetMeta(t.datasetIndex);
        const pt = meta && meta.data[t.mesIndex];
        if (!pt) return;
        const x = pt.x, y = pt.y;

        ctx.save();
        // Ponto destacado
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = t.color;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#fff';
        ctx.stroke();

        // Caixa de rótulo
        ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        const text = t.label;
        const pad = 6, boxH = 20;
        const boxW = ctx.measureText(text).width + pad * 2;
        let bx = x - boxW / 2;
        let by = y + 10; // abaixo do fundo da curva
        bx = Math.max(chartArea.left + 2, Math.min(bx, chartArea.right - boxW - 2));
        by = Math.min(by, chartArea.bottom - boxH - 2);

        ctx.fillStyle = t.color;
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(bx, by, boxW, boxH, 4); ctx.fill(); }
        else ctx.fillRect(bx, by, boxW, boxH);
        ctx.fillStyle = '#fff';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillText(text, bx + pad, by + boxH / 2);
        ctx.restore();
      });
    }
  };
}

function makeChartsConsolidado(cons, consConsorcio, consBanco) {
  const labels = cons.meses.map(m => mesLabel(m));

  charts.consolidado = new Chart(document.getElementById('chart-consolidado'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Caixa das lojas (entrada)', data: cons.entrada, backgroundColor: 'rgba(16,185,129,0.65)', stack: 'in', order: 2 },
        { label: 'Parcela financiamento', data: cons.saidaParc.map(v => -v), backgroundColor: 'rgba(239,68,68,0.65)', stack: 'out', order: 2 },
        { label: 'Parcela vendedor', data: cons.saidaVend.map(v => -v), backgroundColor: 'rgba(245,158,11,0.65)', stack: 'out', order: 2 },
        { label: 'Fluxo líquido', data: cons.liquido, type: 'line', borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.05)', borderWidth: 2, pointRadius: 0, tension: 0.1, order: 1 },
      ]
    },
    options: {
      maintainAspectRatio: false, responsive: true,
      plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + brl(ctx.parsed.y) }}},
      scales: {
        x: { stacked: true, title: { display: true, text: 'Mês (calendário)' }, ticks: { maxTicksLimit: 18 }},
        y: { title: { display: true, text: 'R$ por mês' }, ticks: { callback: v => formatBRLshort(v) }}
      }
    }
  });

  // Gráfico comparativo de caixa acumulado: consórcio (azul) vs empréstimo
  // (laranja), com o fundo de cada curva ("maior buraco de caixa") marcado e
  // rotulado dentro do corpo do gráfico.
  const troughLabel = (c) => c.pior_acumulado_mes
    ? brlMM(c.pior_acumulado) + ' · ' + mesLabel(c.pior_acumulado_mes) : '';
  const troughs = [
    consConsorcio.pior_acumulado_mes ? { datasetIndex: 0, mesIndex: consConsorcio.pior_acumulado_mes - 1, value: consConsorcio.pior_acumulado, color: '#2563eb', label: troughLabel(consConsorcio) } : null,
    consBanco.pior_acumulado_mes ? { datasetIndex: 1, mesIndex: consBanco.pior_acumulado_mes - 1, value: consBanco.pior_acumulado, color: '#f59e0b', label: troughLabel(consBanco) } : null,
  ].filter(Boolean);

  charts.payback = new Chart(document.getElementById('chart-payback'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Consórcio (acumulado)', data: consConsorcio.acumulado, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.06)', borderWidth: 2, pointRadius: 0, tension: 0.1, fill: true },
        { label: 'Empréstimo (acumulado)', data: consBanco.acumulado, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.06)', borderWidth: 2, pointRadius: 0, tension: 0.1, fill: true },
      ]
    },
    options: {
      maintainAspectRatio: false, responsive: true,
      layout: { padding: { bottom: 24 } },
      plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + brl(ctx.parsed.y) }}},
      scales: {
        x: { title: { display: true, text: 'Mês (calendário)' }, ticks: { maxTicksLimit: 18 }},
        y: { title: { display: true, text: 'R$ acumulado' }, ticks: { callback: v => formatBRLshort(v) }, grid: { color: ctx => ctx.tick.value === 0 ? '#9ca3af' : 'rgba(0,0,0,0.05)' }}
      }
    },
    plugins: [troughMarkersPlugin(troughs)]
  });
}

function makeChartsFinanciamento(inputs, consorcioData, empData, custoPonte) {
  const { parcelas: parc_c } = consorcioData;
  const { parcelas: parc_e } = empData;

  const N = Math.max(parc_c.length, parc_e.length);
  const meses = Array.from({ length: N + 1 }, (_, i) => i);

  const parc_c_align = [0, ...parc_c, ...Array(Math.max(0, N - parc_c.length)).fill(0)];
  const parc_e_align = [...parc_e, ...Array(Math.max(0, N + 1 - parc_e.length)).fill(0)];

  // Custo do ponte distribuído mês a mês, do mês 1 até a contemplação.
  const parc_ponte = new Array(N + 1).fill(0);
  if (inputs.contemp >= 1) {
    const custoMensal = consorcioData.custo_ponte_mensal != null
      ? consorcioData.custo_ponte_mensal
      : custoPonte / inputs.contemp;
    for (let m = 1; m <= inputs.contemp && m <= N; m++) parc_ponte[m] = custoMensal;
  }

  charts.parcelaCmp = new Chart(document.getElementById('chart-parcela-cmp'), {
    type: 'line',
    data: {
      labels: meses,
      datasets: [
        { label: 'Consórcio', data: parc_c_align, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.08)', fill: true, tension: 0.1, pointRadius: 0, borderWidth: 2 },
        { label: 'Empréstimo', data: parc_e_align, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.08)', fill: true, tension: 0.1, pointRadius: 0, borderWidth: 2 },
        { label: 'Custo do ponte', data: parc_ponte, backgroundColor: 'rgba(239,68,68,0.6)', borderColor: '#ef4444', borderWidth: 1, type: 'bar' }
      ]
    },
    options: {
      maintainAspectRatio: false, responsive: true,
      plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + brl(ctx.parsed.y) }}},
      scales: {
        x: { title: { display: true, text: 'Mês desde o início' }, ticks: { maxTicksLimit: 20 }},
        y: { title: { display: true, text: 'R$ por mês' }, ticks: { callback: v => formatBRLshort(v) }}
      }
    }
  });

  const diff = parc_c_align.map((v, i) => v - parc_e_align[i] - parc_ponte[i]);
  charts.diff = new Chart(document.getElementById('chart-diff'), {
    type: 'bar',
    data: {
      labels: meses,
      datasets: [{
        label: 'Diferença (Consórcio − Empréstimo)', data: diff,
        backgroundColor: diff.map(v => v >= 0 ? 'rgba(16,185,129,0.6)' : 'rgba(239,68,68,0.6)'), borderWidth: 0
      }]
    },
    options: {
      maintainAspectRatio: false, responsive: true,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => brl(ctx.parsed.y) }}},
      scales: {
        x: { title: { display: true, text: 'Mês' }, ticks: { maxTicksLimit: 15 }},
        y: { title: { display: true, text: 'R$ (diferença)' }, ticks: { callback: v => formatBRLshort(v) }}
      }
    }
  });

  let acum_c = 0, acum_e = 0;
  const acum_c_arr = parc_c_align.map((v, i) => (acum_c += (v + parc_ponte[i])));
  const acum_e_arr = parc_e_align.map(v => (acum_e += v));
  charts.acumulado = new Chart(document.getElementById('chart-acumulado'), {
    type: 'line',
    data: {
      labels: meses,
      datasets: [
        { label: 'Consórcio (acumulado)', data: acum_c_arr, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.1)', fill: true, tension: 0.1, pointRadius: 0, borderWidth: 2 },
        { label: 'Empréstimo (acumulado)', data: acum_e_arr, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)', fill: true, tension: 0.1, pointRadius: 0, borderWidth: 2 }
      ]
    },
    options: {
      maintainAspectRatio: false, responsive: true,
      plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + brl(ctx.parsed.y) }}},
      scales: {
        x: { title: { display: true, text: 'Mês' }, ticks: { maxTicksLimit: 15 }},
        y: { title: { display: true, text: 'R$ acumulado' }, ticks: { callback: v => formatBRLshort(v) }}
      }
    }
  });

  const total_parcelas = parc_c.reduce((a, b) => a + b, 0);
  const taxa_adm_valor = PROP.taxa_adm_pct * PROP.carta_total;
  const fr_valor = PROP.fundo_reserva_pct * PROP.carta_total;
  const total_sem_incc = FLUXO_SEM_REAJUSTE.reduce((a, b) => a + b, 0) * (inputs.seguro ? 1 + PROP.seguro_adicional_pct : 1);
  const efeito_incc = total_parcelas - total_sem_incc;
  const seguro_valor = inputs.seguro ? (total_parcelas - total_parcelas / (1 + PROP.seguro_adicional_pct)) : 0;

  charts.composicao = new Chart(document.getElementById('chart-composicao'), {
    type: 'doughnut',
    data: {
      labels: ['Taxa administração', 'Fundo de reserva', 'Efeito INCC', 'Custo do ponte', ...(inputs.seguro ? ['Seguro'] : [])],
      datasets: [{
        data: [taxa_adm_valor, fr_valor, efeito_incc, custoPonte, ...(inputs.seguro ? [seguro_valor] : [])],
        backgroundColor: ['#f59e0b', '#ef4444', '#2563eb', '#ec4899', '#7c3aed'], borderWidth: 2, borderColor: 'white',
      }]
    },
    options: {
      maintainAspectRatio: false, responsive: true,
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => ctx.label + ': ' + brl(ctx.parsed) }}}
    }
  });

  const saldos = calcSaldoDevedorReal(parc_c, inputs.contemp);
  charts.saldo = new Chart(document.getElementById('chart-saldo'), {
    type: 'line',
    data: {
      labels: saldos.map((_, i) => i),
      datasets: [{ label: 'Saldo Devedor', data: saldos, borderColor: '#7c3aed', backgroundColor: 'rgba(124,58,237,0.1)', fill: true, tension: 0.1, pointRadius: 0, borderWidth: 2 }]
    },
    options: {
      maintainAspectRatio: false, responsive: true,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => brl(ctx.parsed.y) }}},
      scales: {
        x: { title: { display: true, text: 'Mês' }, ticks: { maxTicksLimit: 15 }},
        y: { title: { display: true, text: 'R$' }, ticks: { callback: v => formatBRLshort(v) }}
      }
    }
  });

  const inccs = [0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.10, 0.12];
  const tirs_incc = [], totais_incc = [];
  for (const incc of inccs) {
    const { fluxo: f_alt, parcelas: p_alt, custo_ponte: cp_alt } = buildFluxoConsorcio({ ...inputs, incc });
    const tir_alt = calcTIRanual(f_alt);
    tirs_incc.push(tir_alt == null ? null : tir_alt * 100);
    totais_incc.push((p_alt.reduce((a, b) => a + b, 0) + cp_alt) / 1e6);
  }
  charts.sensIncc = new Chart(document.getElementById('chart-sens-incc'), {
    type: 'line',
    data: {
      labels: inccs.map(i => (i * 100).toFixed(0) + '%'),
      datasets: [
        { label: 'TIR consórcio a.a. (%)', data: tirs_incc, borderColor: '#ef4444', fill: false, yAxisID: 'y', tension: 0.2, borderWidth: 2 },
        { label: 'Total desembolsado (R$ mi)', data: totais_incc, borderColor: '#2563eb', fill: false, yAxisID: 'y1', tension: 0.2, borderWidth: 2 }
      ]
    },
    options: {
      maintainAspectRatio: false, responsive: true, plugins: { legend: { position: 'top' }},
      scales: {
        x: { title: { display: true, text: 'INCC a.a.' }},
        y: { type: 'linear', position: 'left', title: { display: true, text: 'TIR (%)' }},
        y1: { type: 'linear', position: 'right', title: { display: true, text: 'Total (R$ mi)' }, grid: { drawOnChartArea: false }}
      }
    }
  });

  const cdis_fut = [0.05, 0.07, 0.09, 0.10, 0.11, 0.12, 0.13, 0.14, 0.15];
  const tirs_cdi = [], totais_cdi = [];
  for (const cdi_f of cdis_fut) {
    const e_alt = buildFluxoEmprestimo(inputs.emp_valor, inputs.cdi, cdi_f, EMPRESTIMO.spread_aa);
    const tir_cdi = calcTIRanual(e_alt.fluxo);
    tirs_cdi.push(tir_cdi == null ? null : tir_cdi * 100);
    totais_cdi.push(e_alt.total_pago / 1e6);
  }
  charts.sensCdi = new Chart(document.getElementById('chart-sens-cdi'), {
    type: 'line',
    data: {
      labels: cdis_fut.map(i => (i * 100).toFixed(0) + '%'),
      datasets: [
        { label: 'TIR empréstimo a.a. (%)', data: tirs_cdi, borderColor: '#f59e0b', fill: false, yAxisID: 'y', tension: 0.2, borderWidth: 2 },
        { label: 'Total pago (R$ mi)', data: totais_cdi, borderColor: '#2563eb', fill: false, yAxisID: 'y1', tension: 0.2, borderWidth: 2 }
      ]
    },
    options: {
      maintainAspectRatio: false, responsive: true, plugins: { legend: { position: 'top' }},
      scales: {
        x: { title: { display: true, text: 'CDI futuro projetado (em 5 anos)' }},
        y: { type: 'linear', position: 'left', title: { display: true, text: 'TIR (%)' }},
        y1: { type: 'linear', position: 'right', title: { display: true, text: 'Total (R$ mi)' }, grid: { drawOnChartArea: false }}
      }
    }
  });
}

// ============================= UPDATE =======================================
function update() {
  const inputs = getInputs();
  aplicarInputsNosDados(inputs);

  // Displays dos sliders
  const setTxt = (id, txt) => document.getElementById(id).textContent = txt;
  setTxt('incc-display', pct(inputs.incc));
  setTxt('contemp-display', inputs.contemp);
  setTxt('cdi-display', pct(inputs.cdi));
  setTxt('cdi-fut-display', pct(inputs.cdi_fut));
  setTxt('ponte-spread-display', pct(inputs.ponte_spread));
  setTxt('ativo-caixa-display', formatBRLshort(inputs.ativo_caixa));
  setTxt('ativo-reaj-display', pct(inputs.ativo_reaj));

  // ---------------- Financiamento (consórcio + empréstimo) ----------------
  const consorcioData = buildFluxoConsorcio(inputs);
  const { parcelas, fluxo, custo_ponte } = consorcioData;
  const total_parcelas = parcelas.reduce((a, b) => a + b, 0);

  const desembolso_caixa_real = custo_ponte + total_parcelas;
  const custo_liquido = desembolso_caixa_real - PROP.caixa_liquido;

  const tir_aa = calcTIRanual(fluxo);

  const empData = buildFluxoEmprestimo(inputs.emp_valor, inputs.cdi, inputs.cdi_fut, EMPRESTIMO.spread_aa);
  const tir_aa_e = calcTIRanual(empData.fluxo);

  // ---------------- Consolidado (caixa do ativo vs todas as parcelas) ------
  // Calcula os dois cenários: o escolhido alimenta KPIs e o gráfico de fluxo;
  // ambos alimentam o gráfico comparativo de caixa acumulado.
  const consConsorcio = buildConsolidado(inputs, consorcioData, empData, 'consorcio');
  const consBanco = buildConsolidado(inputs, consorcioData, empData, 'banco');
  const cons = inputs.cenario === 'consorcio' ? consConsorcio : consBanco;

  // KPIs consolidado
  setTxt('k-ativo-caixa', brl(cons.entrada[0] || 0));
  setTxt('k-saida-mes1', brl((cons.saidaParc[0] || 0) + (cons.saidaVend[0] || 0)));
  const liq1 = cons.liquido[0] || 0;
  setTxt('k-liq-mes1', brl(liq1));
  document.getElementById('kpi-liq-mes1').className = 'kpi ' + (liq1 >= 0 ? 'green' : 'red');
  setTxt('k-breakeven', cons.breakeven ? mesLabel(cons.breakeven) + ' (mês ' + cons.breakeven + ')' : 'Não atinge');
  setTxt('k-payback', cons.payback ? mesLabel(cons.payback) + ' (mês ' + cons.payback + ')' : 'Não atinge no horizonte');
  const vendPagoAteAgora = Math.min(6, TRANCHE_VENDEDOR.total_parcelas); // jan→jun/2026 ≈ 6 pagas
  const vendSaldo = Math.max(0, TRANCHE_VENDEDOR.total_parcelas - vendPagoAteAgora) * TRANCHE_VENDEDOR.parcela;
  setTxt('k-vend-saldo', brlMM(vendSaldo));
  setTxt('k-pior-acum', cons.pior_acumulado_mes
    ? brlMM(cons.pior_acumulado) + ' (' + mesLabel(cons.pior_acumulado_mes) + ')'
    : brlMM(0));

  // Veredito consolidado
  const vc = document.getElementById('verdict-consolidado');
  const nomeCen = inputs.cenario === 'consorcio' ? 'Consórcio' : 'Empréstimo';
  if (cons.payback) {
    vc.className = 'verdict good';
    vc.innerHTML = `✅ <b>No cenário ${nomeCen}, o ativo se paga em ${mesLabel(cons.payback)}</b> (mês ${cons.payback}). Break-even mensal a partir de ${cons.breakeven ? mesLabel(cons.breakeven) : '—'}.`;
  } else if (cons.breakeven) {
    vc.className = 'verdict warn';
    vc.innerHTML = `⚖️ <b>No cenário ${nomeCen}, o fluxo mensal fica positivo a partir de ${mesLabel(cons.breakeven)}</b>, mas o caixa acumulado ainda não zera no horizonte. Aumente o caixa das lojas ou alongue o horizonte.`;
  } else {
    vc.className = 'verdict bad';
    vc.innerHTML = `❌ <b>No cenário ${nomeCen}, a geração de caixa das lojas não cobre as parcelas no horizonte.</b> Calibre o caixa livre mensal (premissa atual: ${brl(inputs.ativo_caixa)}).`;
  }

  // KPIs consórcio
  setTxt('k-caixa', brlMM(PROP.caixa_liquido));
  setTxt('k-ponte-custo', brl(custo_ponte));
  setTxt('k-parcelas', brlMM(total_parcelas));
  setTxt('k-desemb', brlMM(desembolso_caixa_real));
  setTxt('k-custo', brlMM(custo_liquido));
  setTxt('k-tir', pct(tir_aa));

  // KPIs empréstimo
  setTxt('k-emp-principal', brlMM(inputs.emp_valor));
  setTxt('k-emp-juros', brlMM(empData.total_juros));
  setTxt('k-emp-total', brlMM(empData.total_pago));
  setTxt('k-emp-tir', pct(tir_aa_e));

  // Veredito financiamento
  const verdict_el = document.getElementById('verdict');
  if (tir_aa == null || tir_aa_e == null) {
    verdict_el.className = 'verdict warn';
    verdict_el.innerHTML = `⚠️ <b>TIR indisponível para comparação.</b> O fluxo de caixa de ${tir_aa == null ? 'consórcio' : 'empréstimo'} não tem uma taxa interna de retorno confiável (fluxo não-convencional). Compare pelo total desembolsado e pelo payback.`;
  } else if (tir_aa < tir_aa_e) {
    verdict_el.className = 'verdict good';
    verdict_el.innerHTML = `✅ <b>Consórcio é mais barato.</b> TIR ${pct(tir_aa)} (consórcio) < ${pct(tir_aa_e)} (empréstimo). Vantagem: ${((tir_aa_e - tir_aa) * 100).toFixed(2).replace('.', ',')} pp a.a.`;
  } else if (tir_aa > tir_aa_e) {
    verdict_el.className = 'verdict bad';
    verdict_el.innerHTML = `❌ <b>Empréstimo é mais barato.</b> TIR ${pct(tir_aa)} (consórcio) > ${pct(tir_aa_e)} (empréstimo). Diferença: ${((tir_aa - tir_aa_e) * 100).toFixed(2).replace('.', ',')} pp a.a.`;
  } else {
    verdict_el.className = 'verdict warn';
    verdict_el.innerHTML = `⚖️ <b>Empatado em TIR.</b> Decida por: prazo, perfil do indexador (CDI vs INCC) e fluxo de caixa.`;
  }

  // Decomposição
  const taxa_adm_valor = PROP.taxa_adm_pct * PROP.carta_total;
  const fr_valor = PROP.fundo_reserva_pct * PROP.carta_total;
  const total_sem_incc = FLUXO_SEM_REAJUSTE.reduce((a, b) => a + b, 0) * (inputs.seguro ? 1 + PROP.seguro_adicional_pct : 1);
  const efeito_incc = total_parcelas - total_sem_incc;
  const seguro_valor = inputs.seguro ? (total_parcelas - total_parcelas / (1 + PROP.seguro_adicional_pct)) : 0;

  const decomp_data = [
    { label: 'Taxa de administração (13,49% sobre carta R$ 58,89M)', valor: taxa_adm_valor, color: '#f59e0b' },
    { label: 'Fundo de reserva (3,71% sobre carta)', valor: fr_valor, color: '#ef4444' },
    { label: 'Efeito do reajuste pelo INCC', valor: efeito_incc, color: '#2563eb' },
    { label: 'Custo do empréstimo ponte (lance)', valor: custo_ponte, color: '#ec4899' },
    ...(inputs.seguro ? [{ label: 'Seguro de vida embutido', valor: seguro_valor, color: '#7c3aed' }] : []),
    { label: 'TOTAL', valor: custo_liquido, color: '#111827' }
  ];
  const max_val = Math.max(...decomp_data.slice(0, -1).map(d => Math.abs(d.valor)));
  document.getElementById('decomp').innerHTML = decomp_data.map((d, i) => {
    const isTotal = i === decomp_data.length - 1;
    const pct_bar = max_val > 0 ? (Math.abs(d.valor) / max_val) * 100 : 0;
    return `<div class="decomp-row"><span>${d.label}</span>${isTotal ? '' : `<div class="bar"><div class="bar-fill" style="width:${pct_bar}%; background:${d.color}"></div></div>`}<span class="val">${brl(d.valor)}</span></div>`;
  }).join('');

  // Tabela absoluta
  const consorcio_pmt_media = total_parcelas / parcelas.filter(p => p > 0).length;
  const emp_pmt_media = empData.total_pago / EMPRESTIMO.total_parcelas;
  const rows = [
    ['Valor disponível (caixa)', PROP.caixa_liquido, inputs.emp_valor, 'neutral', 'brl'],
    ['Parcela média mensal', consorcio_pmt_media, emp_pmt_media, 'lower_better', 'brl'],
    ['Maior parcela mensal', Math.max(...parcelas), Math.max(...empData.parcelas), 'lower_better', 'brl'],
    ['Prazo (meses)', PROP.prazo_max, EMPRESTIMO.total_parcelas, 'neutral', 'int'],
    ['TIR a.a.', tir_aa, tir_aa_e, 'lower_better', 'pct'],
    ['Total nominal pago', desembolso_caixa_real, empData.total_pago, 'lower_better', 'brl'],
    ['Custo financeiro líquido', custo_liquido, empData.total_juros, 'lower_better', 'brl'],
  ];
  document.querySelector('#tbl-compare tbody').innerHTML = rows.map(([label, c, e, dir, type]) => {
    const fmt = type === 'pct' ? pct : (type === 'int' ? (v => Math.round(v).toString()) : brl);
    const diff = c - e;
    let cls_c = '', cls_e = '';
    if (dir === 'lower_better') {
      cls_c = c < e ? 'winner-bg' : 'loser-bg';
      cls_e = c > e ? 'winner-bg' : 'loser-bg';
    }
    const diff_str = (diff > 0 ? '+' : '') + fmt(diff);
    return `<tr><td>${label}</td><td class="num ${cls_c}">${fmt(c)}</td><td class="num ${cls_e}">${fmt(e)}</td><td class="num">${diff_str}</td></tr>`;
  }).join('');

  // Charts
  destroyCharts();
  makeChartsConsolidado(cons, consConsorcio, consBanco);
  makeChartsFinanciamento(inputs, consorcioData, empData, custo_ponte);
}

document.querySelectorAll('input, select').forEach(el => {
  el.addEventListener('input', update);
  el.addEventListener('change', update);
});

update();
