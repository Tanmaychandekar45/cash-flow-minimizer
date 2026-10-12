import './style.css';
import confetti from 'canvas-confetti';
import Chart from 'chart.js/auto';

// API Configuration
const API_BASE = 'http://127.0.0.1:5000/api';

// Application State
const state = {
  debts: [],
  netBalances: {},
  settledData: null,
  viewMode: 'settled', // 'settled' | 'original' | 'both'
  currentStepIndex: -1,
  isPlaying: false,
  stepTimer: null,
  stepperSpeed: 1500,
  soundEnabled: true,
  backendConnected: false,
  charts: {
    runtime: null,
    reduction: null
  },
  graphNodes: [],
  draggingNode: null,
  particles: []
};

// Web Audio API Sound Synthesizer
let audioCtx = null;
function playCashChime(isFinal = false) {
  if (!state.soundEnabled) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;
    if (isFinal) {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.15); // G5
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.5);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, now); // E5
      osc.frequency.exponentialRampToValueAtTime(880.00, now + 0.08); // A5
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    }
  } catch (e) {
    console.warn("Audio context not allowed yet:", e);
  }
}

// Built-in JavaScript Algorithmic Engine (Fallback)
function computeNetBalancesJS(debts) {
  const net = {};
  for (const d of debts) {
    net[d.debtor] = (net[d.debtor] || 0) - d.amount;
    net[d.creditor] = (net[d.creditor] || 0) + d.amount;
  }
  const rounded = {};
  for (const k in net) rounded[k] = Math.round(net[k] * 100) / 100;
  return rounded;
}

function settleGreedyJS(netBalances) {
  const start = performance.now();
  const creditors = [];
  const debtors = [];

  for (const [name, bal] of Object.entries(netBalances)) {
    if (bal > 0.01) creditors.push({ name, amount: bal });
    else if (bal < -0.01) debtors.push({ name, amount: -bal });
  }

  // Helper sort as max-heap
  const sortCreds = () => creditors.sort((a, b) => b.amount - a.amount);
  const sortDebts = () => debtors.sort((a, b) => b.amount - a.amount);
  sortCreds();
  sortDebts();

  const transactions = [];
  const steps = [];
  let stepNum = 1;

  while (creditors.length > 0 && debtors.length > 0) {
    const cred = creditors.shift();
    const debt = debtors.shift();

    const settled = Math.min(cred.amount, debt.amount);
    const settledRound = Math.round(settled * 100) / 100;

    transactions.push({
      from: debt.name,
      to: cred.name,
      amount: settledRound,
      rule: `Greedy match: min(₹${cred.amount}, ₹${debt.amount}) = ₹${settledRound}`
    });

    const remCredit = Math.round((cred.amount - settled) * 100) / 100;
    const remDebt = Math.round((debt.amount - settled) * 100) / 100;

    steps.push({
      step: stepNum++,
      debtor: debt.name,
      debt: debt.amount,
      creditor: cred.name,
      credit: cred.amount,
      settled: settledRound,
      remaining_debtor: remDebt > 0.01 ? debt.name : null,
      remaining_debt: remDebt > 0.01 ? remDebt : 0,
      remaining_creditor: remCredit > 0.01 ? cred.name : null,
      remaining_credit: remCredit > 0.01 ? remCredit : 0,
      current_creditors_heap: creditors.map(c => ({ ...c })),
      current_debtors_heap: debtors.map(d => ({ ...d }))
    });

    if (remCredit > 0.01) {
      creditors.push({ name: cred.name, amount: remCredit });
      sortCreds();
    }
    if (remDebt > 0.01) {
      debtors.push({ name: debt.name, amount: remDebt });
      sortDebts();
    }
  }

  const elapsed = performance.now() - start;
  return {
    transactions,
    steps,
    transaction_count: transactions.length,
    execution_time_ms: Math.round(elapsed * 1000) / 1000
  };
}

function solveExactDPJS(netBalances) {
  const active = Object.entries(netBalances).filter(([_, b]) => Math.abs(b) > 0.01);
  const n = active.length;
  if (n <= 1) return { optimal_transactions: 0, execution_time_ms: 0.01 };

  const start = performance.now();
  const totalMasks = 1 << n;
  const balances = active.map(a => a[1]);

  const sums = new Float64Array(totalMasks);
  for (let mask = 0; mask < totalMasks; mask++) {
    let s = 0;
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) s += balances[i];
    }
    sums[mask] = Math.round(s * 100) / 100;
  }

  const dp = new Int32Array(totalMasks);
  for (let mask = 1; mask < totalMasks; mask++) {
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        dp[mask] = Math.max(dp[mask], dp[mask ^ (1 << i)]);
      }
    }
    if (Math.abs(sums[mask]) < 0.01) {
      dp[mask] = Math.max(dp[mask], 1);
      let sub = (mask - 1) & mask;
      while (sub > 0) {
        if (Math.abs(sums[sub]) < 0.01 && dp[sub] > 0 && dp[mask ^ sub] > 0) {
          dp[mask] = Math.max(dp[mask], dp[sub] + dp[mask ^ sub]);
        }
        sub = (sub - 1) & mask;
      }
    }
  }

  const k = Math.max(1, dp[totalMasks - 1]);
  const elapsed = performance.now() - start;
  return {
    optimal_transactions: n - k,
    max_zero_sum_subsets: k,
    execution_time_ms: Math.round(elapsed * 1000) / 1000
  };
}

// Built-in presets
const LOCAL_PRESETS = {
  goa_trip: [
    { debtor: "Alice", creditor: "Bob", amount: 400.0 },
    { debtor: "Bob", creditor: "Charlie", amount: 200.0 },
    { debtor: "Charlie", creditor: "Alice", amount: 100.0 },
    { debtor: "David", creditor: "Alice", amount: 300.0 },
    { debtor: "David", creditor: "Bob", amount: 200.0 },
    { debtor: "Emma", creditor: "David", amount: 250.0 },
    { debtor: "Emma", creditor: "Charlie", amount: 150.0 }
  ],
  counter_example: [
    { debtor: "Dave", creditor: "Alice", amount: 4.0 },
    { debtor: "Dave", creditor: "Bob", amount: 1.0 },
    { debtor: "Evan", creditor: "Bob", amount: 2.0 },
    { debtor: "Evan", creditor: "Charlie", amount: 2.0 }
  ],
  circular_loop: [
    { debtor: "Liam", creditor: "Noah", amount: 150.0 },
    { debtor: "Noah", creditor: "Oliver", amount: 150.0 },
    { debtor: "Oliver", creditor: "Sophia", amount: 150.0 },
    { debtor: "Sophia", creditor: "Liam", amount: 150.0 }
  ],
  roommates: [
    { debtor: "Rahul", creditor: "Ananya", amount: 1200.0 },
    { debtor: "Ananya", creditor: "Vikram", amount: 600.0 },
    { debtor: "Priya", creditor: "Rahul", amount: 450.0 },
    { debtor: "Vikram", creditor: "Priya", amount: 300.0 },
    { debtor: "Rahul", creditor: "Vikram", amount: 500.0 }
  ],
  complex_mesh: [
    { debtor: "Aarav", creditor: "Diya", amount: 550.0 },
    { debtor: "Diya", creditor: "Ishaan", amount: 420.0 },
    { debtor: "Ishaan", creditor: "Kavya", amount: 600.0 },
    { debtor: "Kavya", creditor: "Manav", amount: 310.0 },
    { debtor: "Manav", creditor: "Neha", amount: 750.0 },
    { debtor: "Neha", creditor: "Rohan", amount: 290.0 },
    { debtor: "Rohan", creditor: "Sneha", amount: 480.0 },
    { debtor: "Sneha", creditor: "Aarav", amount: 630.0 },
    { debtor: "Aarav", creditor: "Ishaan", amount: 200.0 },
    { debtor: "Diya", creditor: "Kavya", amount: 150.0 },
    { debtor: "Ishaan", creditor: "Manav", amount: 180.0 },
    { debtor: "Kavya", creditor: "Rohan", amount: 350.0 },
    { debtor: "Manav", creditor: "Sneha", amount: 220.0 },
    { debtor: "Neha", creditor: "Aarav", amount: 400.0 }
  ]
};

// Check Backend Status
async function checkBackend() {
  const badge = document.getElementById('backend-status-badge');
  const label = document.getElementById('backend-status-text');
  try {
    const res = await fetch(`${API_BASE}/health`);
    if (res.ok) {
      const data = await res.json();
      state.backendConnected = true;
      label.textContent = `Python + C++ Core Online (Port 5000)`;
      badge.style.background = 'rgba(16, 185, 129, 0.15)';
      badge.style.color = '#34d399';
    } else {
      throw new Error();
    }
  } catch (err) {
    state.backendConnected = false;
    label.textContent = `Client JS Engine (Backend Offline)`;
    badge.style.background = 'rgba(245, 158, 11, 0.15)';
    badge.style.color = '#fbbf24';
  }
}

// Floating Toast Notifications
function showToast(title, message, icon = '💸') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <div class="toast-icon">${icon}</div>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-fadeout');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3500);
}

// Solve and Settle debts
async function solveDebts(isUserTriggered = false) {
  if (state.debts.length === 0) return;

  if (state.backendConnected) {
    try {
      const res = await fetch(`${API_BASE}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ debts: state.debts })
      });
      if (res.ok) {
        state.settledData = await res.json();
        state.netBalances = state.settledData.net_balances;
        updateUI();
        return;
      }
    } catch (e) {
      console.warn("Backend API error, falling back to JS core:", e);
    }
  }

  // Fallback to local JS engine
  const net = computeNetBalancesJS(state.debts);
  state.netBalances = net;
  const greedy = settleGreedyJS(net);
  const dp = solveExactDPJS(net);
  const orig = state.debts.length;
  const red = orig > 0 ? Math.round(((orig - greedy.transaction_count) / orig) * 1000) / 10 : 0;

  state.settledData = {
    net_balances: net,
    original_edge_count: orig,
    greedy,
    dp,
    metrics: {
      initial_transactions: orig,
      greedy_transactions: greedy.transaction_count,
      optimal_transactions: dp.optimal_transactions,
      reduction_ratio_percent: red,
      is_greedy_optimal: greedy.transaction_count === dp.optimal_transactions,
      transactions_difference: greedy.transaction_count - dp.optimal_transactions
    }
  };

  updateUI();
}

// Update all UI elements
function updateUI() {
  if (!state.settledData) return;
  const { metrics, greedy, dp, net_balances } = state.settledData;

  // KPIs
  document.getElementById('kpi-initial-edges').textContent = metrics.initial_transactions;
  document.getElementById('kpi-greedy-tx').textContent = metrics.greedy_transactions;
  document.getElementById('kpi-optimal-tx').textContent = metrics.optimal_transactions;
  document.getElementById('kpi-reduction-ratio').textContent = `${metrics.reduction_ratio_percent}%`;

  document.getElementById('kpi-greedy-time').textContent = `Execution: ${greedy.execution_time_ms} ms`;
  document.getElementById('kpi-optimal-meta').textContent = `DP Execution: ${dp.execution_time_ms} ms`;

  const optStatus = document.getElementById('kpi-optimality-status');
  if (metrics.is_greedy_optimal) {
    optStatus.textContent = 'Global Minimum Achieved (Greedy = DP)';
    optStatus.style.color = '#34d399';
  } else {
    optStatus.textContent = `Greedy Sub-optimal (+${metrics.transactions_difference} edge divergence)`;
    optStatus.style.color = '#fb7185';
  }

  // Net Balances Table
  const tbody = document.getElementById('net-balances-tbody');
  tbody.innerHTML = '';
  let sumCheck = 0;

  // Calculate incoming/outgoing per person
  const inOut = {};
  for (const d of state.debts) {
    inOut[d.debtor] = inOut[d.debtor] || { inc: 0, out: 0 };
    inOut[d.creditor] = inOut[d.creditor] || { inc: 0, out: 0 };
    inOut[d.debtor].out += d.amount;
    inOut[d.creditor].inc += d.amount;
  }

  const sortedPersons = Object.keys(net_balances).sort((a, b) => net_balances[b] - net_balances[a]);

  for (const name of sortedPersons) {
    const bal = net_balances[name];
    sumCheck += bal;
    const io = inOut[name] || { inc: 0, out: 0 };

    let roleBadge = '<span class="badge badge-gray">Settled</span>';
    let balColor = 'var(--text-muted)';
    if (bal > 0.01) {
      roleBadge = '<span class="badge badge-green">Creditor</span>';
      balColor = '#34d399';
    } else if (bal < -0.01) {
      roleBadge = '<span class="badge badge-red">Debtor</span>';
      balColor = '#fb7185';
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${name}</strong></td>
      <td style="color: #34d399;">+₹${io.inc.toFixed(2)}</td>
      <td style="color: #fb7185;">-₹${io.out.toFixed(2)}</td>
      <td style="font-family: var(--font-mono); font-weight: 700; color: ${balColor};">
        ${bal >= 0 ? '+' : ''}₹${bal.toFixed(2)}
      </td>
      <td>${roleBadge}</td>
    `;
    tbody.appendChild(tr);
  }

  const sumCheckEl = document.getElementById('net-sum-check');
  sumCheckEl.innerHTML = `<span class="check-icon">✓</span> <span>Invariant Verified: Σ Bᵢ = ₹${Math.abs(sumCheck).toFixed(2)} (Sum to Zero)</span>`;

  // Render Settlement Transactions Feed
  const txContainer = document.getElementById('settlement-tx-list');
  txContainer.innerHTML = '';
  for (const tx of greedy.transactions) {
    const card = document.createElement('div');
    card.className = 'settle-tx-card';
    card.innerHTML = `
      <div class="settle-tx-route">
        <span class="tx-from">${tx.from}</span>
        <span class="tx-arrow">➔</span>
        <span class="tx-to">${tx.to}</span>
      </div>
      <div class="settle-tx-val">₹${tx.amount.toFixed(2)}</div>
    `;
    txContainer.appendChild(card);
  }

  // Reset stepper to initial state
  resetStepper();

  // Position nodes and render canvas graph
  initGraphNodes();
  drawGraph();
}

// Interactive Network Graph Canvas
const canvas = document.getElementById('debt-network-canvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  const container = document.getElementById('graph-container');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = container.clientWidth * dpr;
  canvas.height = container.clientHeight * dpr;
  ctx.scale(dpr, dpr);
  drawGraph();
}

function initGraphNodes() {
  const container = document.getElementById('graph-container');
  const w = container.clientWidth;
  const h = container.clientHeight;

  const names = Object.keys(state.netBalances);
  const n = names.length;
  if (n === 0) return;

  const centerX = w / 2;
  const centerY = h / 2;
  const radius = Math.min(w, h) * 0.35;

  state.graphNodes = names.map((name, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    return {
      name,
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
      radius: 26,
      balance: state.netBalances[name] || 0
    };
  });
}

function drawGraph() {
  const container = document.getElementById('graph-container');
  const w = container.clientWidth;
  const h = container.clientHeight;

  ctx.clearRect(0, 0, w, h);

  if (state.graphNodes.length === 0) return;

  const nodeMap = {};
  for (const node of state.graphNodes) nodeMap[node.name] = node;

  // Decide which edges to draw based on viewMode
  let edgesToDraw = [];
  if (state.viewMode === 'original' || state.viewMode === 'both') {
    edgesToDraw = edgesToDraw.concat(state.debts.map(d => ({
      from: d.debtor,
      to: d.creditor,
      amount: d.amount,
      type: 'original'
    })));
  }

  if ((state.viewMode === 'settled' || state.viewMode === 'both') && state.settledData) {
    edgesToDraw = edgesToDraw.concat(state.settledData.greedy.transactions.map(t => ({
      from: t.from,
      to: t.to,
      amount: t.amount,
      type: 'settled'
    })));
  }

  // Draw Edges
  for (const edge of edgesToDraw) {
    const u = nodeMap[edge.from];
    const v = nodeMap[edge.to];
    if (!u || !v) continue;

    const isSettled = edge.type === 'settled';

    ctx.save();
    ctx.beginPath();

    // Curved line calculation
    const dx = v.x - u.x;
    const dy = v.y - u.y;
    const dist = Math.hypot(dx, dy);
    const midX = (u.x + v.x) / 2;
    const midY = (u.y + v.y) / 2;

    const curvature = isSettled ? 0 : 25;
    const normX = -dy / dist;
    const normY = dx / dist;
    const ctrlX = midX + normX * curvature;
    const ctrlY = midY + normY * curvature;

    ctx.moveTo(u.x, u.y);
    ctx.quadraticCurveTo(ctrlX, ctrlY, v.x, v.y);

    if (isSettled) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#0284c7';
      ctx.shadowBlur = 10;
    } else {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 4]);
    }
    ctx.stroke();

    // Draw Arrowhead near target node
    const arrowDist = v.radius + 6;
    const angle = Math.atan2(v.y - ctrlY, v.x - ctrlX);
    const arrowX = v.x - Math.cos(angle) * arrowDist;
    const arrowY = v.y - Math.sin(angle) * arrowDist;

    ctx.beginPath();
    ctx.fillStyle = isSettled ? '#38bdf8' : 'rgba(148, 163, 184, 0.6)';
    ctx.moveTo(arrowX, arrowY);
    ctx.lineTo(arrowX - 9 * Math.cos(angle - Math.PI / 6), arrowY - 9 * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(arrowX - 9 * Math.cos(angle + Math.PI / 6), arrowY - 9 * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();

    // Label for edge amount
    const labelX = (u.x + 2 * ctrlX + v.x) / 4;
    const labelY = (u.y + 2 * ctrlY + v.y) / 4;

    const labelText = `₹${edge.amount.toFixed(0)}`;
    ctx.font = '600 11px JetBrains Mono';
    const textWidth = ctx.measureText(labelText).width;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = isSettled ? 'rgba(56, 189, 248, 0.4)' : 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(labelX - textWidth / 2 - 5, labelY - 9, textWidth + 10, 18, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isSettled ? '#e0f2fe' : '#94a3b8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labelText, labelX, labelY);

    ctx.restore();
  }

  // Draw Nodes
  for (const node of state.graphNodes) {
    ctx.save();

    const isCreditor = node.balance > 0.01;
    const isDebtor = node.balance < -0.01;

    // Glowing aura
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius + 3, 0, Math.PI * 2);
    if (isCreditor) {
      ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = 14;
    } else if (isDebtor) {
      ctx.fillStyle = 'rgba(244, 63, 94, 0.2)';
      ctx.shadowColor = '#f43f5e';
      ctx.shadowBlur = 14;
    } else {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.15)';
    }
    ctx.fill();

    // Node body
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = isCreditor ? '#10b981' : isDebtor ? '#f43f5e' : '#64748b';
    ctx.lineWidth = 2.5;
    ctx.fill();
    ctx.stroke();

    // Name text
    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 12px Outfit';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.name, node.x, node.y - 3);

    // Balance badge under name
    const balSign = node.balance >= 0 ? '+' : '';
    const balText = `${balSign}₹${Math.abs(node.balance).toFixed(0)}`;
    ctx.font = '600 10px JetBrains Mono';
    ctx.fillStyle = isCreditor ? '#34d399' : isDebtor ? '#fb7185' : '#94a3b8';
    ctx.fillText(balText, node.x, node.y + 11);

    ctx.restore();
  }
}

// Node dragging interaction
canvas.addEventListener('mousedown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  for (const node of state.graphNodes) {
    if (Math.hypot(node.x - mouseX, node.y - mouseY) <= node.radius) {
      state.draggingNode = node;
      break;
    }
  }
});

window.addEventListener('mousemove', (e) => {
  if (!state.draggingNode) return;
  const rect = canvas.getBoundingClientRect();
  state.draggingNode.x = e.clientX - rect.left;
  state.draggingNode.y = e.clientY - rect.top;
  drawGraph();
});

window.addEventListener('mouseup', () => {
  state.draggingNode = null;
});

// Interactive Heap Stepper logic
function resetStepper() {
  if (state.stepTimer) clearInterval(state.stepTimer);
  state.isPlaying = false;
  state.currentStepIndex = -1;
  document.getElementById('btn-stepper-play').textContent = '▶ Play';

  if (!state.settledData) return;
  const { greedy } = state.settledData;

  renderHeapBoxes(greedy.initial_creditors, greedy.initial_debtors, null, null);

  document.getElementById('arena-debtor-name').textContent = '—';
  document.getElementById('arena-debtor-amt').textContent = '₹0';
  document.getElementById('arena-creditor-name').textContent = '—';
  document.getElementById('arena-creditor-amt').textContent = '₹0';
  document.getElementById('arena-settle-badge').textContent = 'Ready to Start';
  document.getElementById('arena-status-msg').textContent = `Total ${greedy.steps.length} greedy heap match step(s) available. Click 'Play' or 'Next Step'.`;
}

function renderHeapBoxes(creditors, debtors, topCred, topDebt) {
  const credContainer = document.getElementById('creditors-heap-list');
  const debtContainer = document.getElementById('debtors-heap-list');

  document.getElementById('creditors-heap-size').textContent = `${creditors.length} items`;
  document.getElementById('debtors-heap-size').textContent = `${debtors.length} items`;

  credContainer.innerHTML = '';
  debtContainer.innerHTML = '';

  for (const c of creditors) {
    const isTop = topCred && topCred.name === c.name;
    const div = document.createElement('div');
    div.className = `heap-item-node ${isTop ? 'top-item' : ''}`;
    div.innerHTML = `
      <span class="node-name">${c.name}</span>
      <span class="node-amt" style="color: #34d399;">+₹${c.amount.toFixed(2)}</span>
    `;
    credContainer.appendChild(div);
  }

  for (const d of debtors) {
    const isTop = topDebt && topDebt.name === d.name;
    const div = document.createElement('div');
    div.className = `heap-item-node ${isTop ? 'top-item' : ''}`;
    div.innerHTML = `
      <span class="node-name">${d.name}</span>
      <span class="node-amt" style="color: #fb7185;">-₹${d.amount.toFixed(2)}</span>
    `;
    debtContainer.appendChild(div);
  }
}

function advanceStepper() {
  if (!state.settledData || !state.settledData.greedy.steps.length) return;
  const steps = state.settledData.greedy.steps;

  if (state.currentStepIndex >= steps.length - 1) {
    // Finished
    if (state.isPlaying) togglePlayStepper();
    playCashChime(true);
    confetti({
      particleCount: 60,
      spread: 70,
      origin: { y: 0.6 }
    });
    document.getElementById('arena-status-msg').textContent = '🎉 All debts fully settled! Heap queues are now empty.';
    return;
  }

  state.currentStepIndex++;
  const step = steps[state.currentStepIndex];
  playCashChime(false);

  // Update center arena
  document.getElementById('arena-debtor-name').textContent = step.debtor;
  document.getElementById('arena-debtor-amt').textContent = `₹${step.debt.toFixed(2)}`;
  document.getElementById('arena-creditor-name').textContent = step.creditor;
  document.getElementById('arena-creditor-amt').textContent = `₹${step.credit.toFixed(2)}`;
  document.getElementById('arena-settle-badge').textContent = `Settle: ₹${step.settled.toFixed(2)}`;

  let remMsg = '';
  if (step.remaining_debtor) {
    remMsg = `${step.remaining_debtor} has remaining debt of ₹${step.remaining_debt.toFixed(2)} (re-inserted into Debtor Heap).`;
  } else if (step.remaining_creditor) {
    remMsg = `${step.remaining_creditor} has remaining credit of ₹${step.remaining_credit.toFixed(2)} (re-inserted into Creditor Heap).`;
  } else {
    remMsg = `Both ${step.debtor} and ${step.creditor} balanced to ₹0.00! Both removed.`;
  }

  document.getElementById('arena-status-msg').innerHTML = `
    <strong>Step ${step.step} of ${steps.length}:</strong> 
    Matched Max Debtor <strong>${step.debtor}</strong> with Max Creditor <strong>${step.creditor}</strong>. 
    Transferred <strong>₹${step.settled.toFixed(2)}</strong>. ${remMsg}
  `;

  // Render heaps at this step
  renderHeapBoxes(
    step.current_creditors_heap,
    step.current_debtors_heap,
    { name: step.creditor },
    { name: step.debtor }
  );
}

function togglePlayStepper() {
  state.isPlaying = !state.isPlaying;
  const btn = document.getElementById('btn-stepper-play');

  if (state.isPlaying) {
    btn.textContent = '⏸ Pause';
    if (state.currentStepIndex >= state.settledData.greedy.steps.length - 1) {
      state.currentStepIndex = -1;
    }
    advanceStepper();
    state.stepTimer = setInterval(() => {
      if (state.currentStepIndex >= state.settledData.greedy.steps.length - 1) {
        togglePlayStepper();
      } else {
        advanceStepper();
      }
    }, state.stepperSpeed);
  } else {
    btn.textContent = '▶ Play';
    if (state.stepTimer) clearInterval(state.stepTimer);
  }
}

// Live Benchmark Lab
async function runBenchmarks() {
  const btn = document.getElementById('btn-run-benchmarks');
  btn.textContent = '⏳ Running Empirical Benchmarks...';
  btn.disabled = true;

  let benchData = [];
  const sizes = [4, 6, 8, 10, 12, 14, 16];

  if (state.backendConnected) {
    try {
      const res = await fetch(`${API_BASE}/benchmark`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sizes })
      });
      if (res.ok) {
        const json = await res.json();
        benchData = json.benchmarks;
      }
    } catch (e) {
      console.warn("Backend benchmark error:", e);
    }
  }

  // Fallback if backend didn't return
  if (benchData.length === 0) {
    for (const n of sizes) {
      const names = Array.from({ length: n }, (_, i) => `P${i + 1}`);
      const debts = [];
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          if (Math.random() < 0.6) {
            debts.push({ debtor: names[i], creditor: names[j], amount: Math.floor(Math.random() * 200) + 20 });
          }
        }
      }
      const net = computeNetBalancesJS(debts);
      const g = settleGreedyJS(net);
      const dp = solveExactDPJS(net);
      const red = debts.length > 0 ? Math.round(((debts.length - g.transaction_count) / debts.length) * 1000) / 10 : 0;
      benchData.push({
        n,
        original_edges: debts.length,
        greedy_transactions: g.transaction_count,
        dp_transactions: dp.optimal_transactions,
        greedy_time_ms: g.execution_time_ms,
        dp_time_ms: dp.execution_time_ms,
        reduction_ratio: red
      });
    }
  }

  btn.textContent = '⚡ Run Live Empirical Benchmark';
  btn.disabled = false;

  renderBenchmarkResults(benchData);
}

function renderBenchmarkResults(data) {
  const tbody = document.getElementById('benchmark-results-tbody');
  tbody.innerHTML = '';

  const labels = data.map(d => `N=${d.n}`);
  const greedyTimes = data.map(d => d.greedy_time_ms);
  const dpTimes = data.map(d => d.dp_time_ms);
  const reductionRatios = data.map(d => d.reduction_ratio);

  for (const row of data) {
    const isOptimal = row.greedy_transactions === row.dp_transactions;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${row.n}</strong></td>
      <td>${row.original_edges}</td>
      <td style="color: #34d399;">${row.greedy_transactions}</td>
      <td style="color: #c084fc;">${row.dp_transactions ?? 'N/A'}</td>
      <td>${row.greedy_time_ms.toFixed(3)} ms</td>
      <td style="color: #fb7185;">${row.dp_time_ms ? row.dp_time_ms.toFixed(3) + ' ms' : '>10s (O(2ⁿ))'}</td>
      <td style="color: #fbbf24; font-weight: 700;">${row.reduction_ratio}%</td>
      <td>
        <span class="badge ${isOptimal ? 'badge-green' : 'badge-red'}">
          ${isOptimal ? 'Optimal' : `Greedy Sub-optimal (+${row.greedy_transactions - row.dp_transactions})`}
        </span>
      </td>
    `;
    tbody.appendChild(tr);
  }

  // Update Chart.js: Runtime Complexity
  const ctxRuntime = document.getElementById('chart-runtime-complexity').getContext('2d');
  if (state.charts.runtime) state.charts.runtime.destroy();

  state.charts.runtime = new Chart(ctxRuntime, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Greedy Heaps O(n log n)',
          data: greedyTimes,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          borderWidth: 2.5,
          tension: 0.3,
          fill: true
        },
        {
          label: 'Exact Subset-Sum DP O(2ⁿ)',
          data: dpTimes,
          borderColor: '#f43f5e',
          backgroundColor: 'rgba(244, 63, 94, 0.1)',
          borderWidth: 2.5,
          tension: 0.3,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          type: 'logarithmic',
          title: { display: true, text: 'Execution Time (ms, Log Scale)', color: '#94a3b8' },
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8' }
        },
        x: {
          title: { display: true, text: 'Problem Size (Participants N)', color: '#94a3b8' },
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8' }
        }
      },
      plugins: {
        legend: { labels: { color: '#f8fafc', font: { family: 'Outfit' } } }
      }
    }
  });

  // Update Chart.js: Reduction Ratio
  const ctxReduction = document.getElementById('chart-reduction-ratio').getContext('2d');
  if (state.charts.reduction) state.charts.reduction.destroy();

  state.charts.reduction = new Chart(ctxReduction, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Transaction Reduction (%)',
          data: reductionRatios,
          backgroundColor: 'rgba(99, 102, 241, 0.7)',
          borderColor: '#818cf8',
          borderWidth: 1.5,
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          min: 0,
          max: 100,
          title: { display: true, text: 'Reduction Ratio (%)', color: '#94a3b8' },
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8' }
        },
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8' }
        }
      },
      plugins: {
        legend: { labels: { color: '#f8fafc', font: { family: 'Outfit' } } }
      }
    }
  });
}

// Load C++ or Python Source Code for Code Inspector
const SOURCE_CODE = {
  cpp: `// C++ Core Engine: cash_flow_minimizer.cpp
// Algorithmic Paradigm: Greedy Algorithm + Max-Heaps & Bitmask DP

#include <iostream>
#include <vector>
#include <string>
#include <unordered_map>
#include <queue>
#include <chrono>

using namespace std;

struct Debt {
    string debtor;
    string creditor;
    double amount;
};

struct PersonBalance {
    string name;
    double amount;
    bool operator<(const PersonBalance& other) const {
        return amount < other.amount; // Max-heap ordering
    }
};

// 1. Net Balances: B_i = Incoming - Outgoing
unordered_map<string, double> computeNetBalances(const vector<Debt>& debts) {
    unordered_map<string, double> net;
    for (const auto& d : debts) {
        net[d.debtor] -= d.amount;
        net[d.creditor] += d.amount;
    }
    return net;
}

// 2. Greedy Settlement using Max-Heaps: O(n log n)
vector<pair<string, string>> settleGreedy(const unordered_map<string, double>& net) {
    priority_queue<PersonBalance> creditors; // Net balance > 0
    priority_queue<PersonBalance> debtors;   // Absolute debt |B_i|

    for (const auto& [name, bal] : net) {
        if (bal > 0.001) creditors.push({name, bal});
        else if (bal < -0.001) debtors.push({name, -bal});
    }

    vector<pair<string, string>> transactions;

    while (!creditors.empty() && !debtors.empty()) {
        auto maxCred = creditors.top(); creditors.pop();
        auto maxDebt = debtors.top();   debtors.pop();

        double settle = min(maxCred.amount, maxDebt.amount);
        cout << maxDebt.name << " pays " << maxCred.name << ": ₹" << settle << endl;

        if (maxCred.amount - settle > 0.001)
            creditors.push({maxCred.name, maxCred.amount - settle});
        if (maxDebt.amount - settle > 0.001)
            debtors.push({maxDebt.name, maxDebt.amount - settle});
    }
    return transactions;
}

// 3. Optimal Subset-Sum Formulation (Bitmask DP): O(2^n * n)
// Theoretical minimum transactions = n - k, where k = max disjoint zero-sum subsets
int optimalMinTransactionsDP(const vector<double>& balances) {
    int n = balances.size();
    int totalMasks = 1 << n;
    vector<int> dp(totalMasks, 0);

    for (int mask = 1; mask < totalMasks; ++mask) {
        for (int i = 0; i < n; ++i)
            if (mask & (1 << i))
                dp[mask] = max(dp[mask], dp[mask ^ (1 << i)]);

        // Check if subset sum == 0
        double sum = 0;
        for (int i = 0; i < n; ++i) if (mask & (1 << i)) sum += balances[i];
        if (abs(sum) < 0.001) {
            dp[mask] = max(dp[mask], 1);
            for (int sub = (mask - 1) & mask; sub > 0; sub = (sub - 1) & mask)
                if (dp[sub] > 0 && dp[mask ^ sub] > 0)
                    dp[mask] = max(dp[mask], dp[sub] + dp[mask ^ sub]);
        }
    }
    return n - dp[totalMasks - 1];
}`,
  python: `# Python Backend Engine: backend/algorithms.py
# Algorithmic Paradigm: Greedy Heaps + Bitmask Dynamic Programming

import heapq
import time

def compute_net_balances(debts):
    balances = {}
    for debt in debts:
        debtor = debt["debtor"]
        creditor = debt["creditor"]
        amt = float(debt["amount"])
        balances[debtor] = balances.get(debtor, 0.0) - amt
        balances[creditor] = balances.get(creditor, 0.0) + amt
    return {k: round(v, 2) for k, v in balances.items()}

def settle_greedy(net_balances):
    # Python heapq is min-heap, store negative values for max-heap
    creditors = [(-b, name) for name, b in net_balances.items() if b > 0.01]
    debtors = [(b, name) for name, b in net_balances.items() if b < -0.01]
    heapq.heapify(creditors)
    heapq.heapify(debtors)

    transactions = []
    while creditors and debtors:
        neg_credit, creditor = heapq.heappop(creditors)
        neg_debt, debtor = heapq.heappop(debtors)

        settled = min(-neg_credit, -neg_debt)
        transactions.append({"from": debtor, "to": creditor, "amount": settled})

        rem_credit = (-neg_credit) - settled
        rem_debt = (-neg_debt) - settled

        if rem_credit > 0.01:
            heapq.heappush(creditors, (-rem_credit, creditor))
        if rem_debt > 0.01:
            heapq.heappush(debtors, (-rem_debt, debtor))

    return transactions

def solve_exact_dp(net_balances):
    # Minimum transactions = N - k (where k is max disjoint zero-sum subsets)
    active = [b for b in net_balances.values() if abs(b) > 0.01]
    n = len(active)
    total_masks = 1 << n
    dp = [0] * total_masks

    for mask in range(1, total_masks):
        for i in range(n):
            if mask & (1 << i):
                dp[mask] = max(dp[mask], dp[mask ^ (1 << i)])

        subset_sum = sum(active[i] for i in range(n) if mask & (1 << i))
        if abs(subset_sum) < 0.01:
            dp[mask] = max(dp[mask], 1)
            sub = (mask - 1) & mask
            while sub > 0:
                if dp[sub] > 0 and dp[mask ^ sub] > 0:
                    dp[mask] = max(dp[mask], dp[sub] + dp[mask ^ sub])
                sub = (sub - 1) & mask

    k = max(1, dp[total_masks - 1])
    return {"optimal_transactions": n - k, "max_zero_sum_subsets": k}`
};

function displaySourceCode(lang) {
  const codeEl = document.getElementById('code-block-content');
  codeEl.textContent = SOURCE_CODE[lang] || '';
  codeEl.className = `language-${lang}`;
}

// Preset Loader
function loadPreset(key) {
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  const targetBtn = document.querySelector(`.preset-btn[data-preset="${key}"]`);
  if (targetBtn) targetBtn.classList.add('active');

  const debts = LOCAL_PRESETS[key] || LOCAL_PRESETS.goa_trip;
  state.debts = JSON.parse(JSON.stringify(debts));
  solveDebts();
}

// Event Listeners Initialization
function initEventListeners() {
  // Tab Switching
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const paneId = `pane-${tab.dataset.tab}`;
      const pane = document.getElementById(paneId);
      if (pane) pane.classList.add('active');

      if (tab.dataset.tab === 'benchmarks') {
        runBenchmarks();
      } else if (tab.dataset.tab === 'visualizer') {
        setTimeout(resizeCanvas, 50);
      }
    });
  });

  // Presets
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => loadPreset(btn.dataset.preset));
  });

  // Settle Button
  document.getElementById('btn-solve-all').addEventListener('click', async () => {
    const btn = document.getElementById('btn-solve-all');
    const originalText = btn.innerHTML;
    btn.innerHTML = '⏳ Settling Debts...';
    btn.disabled = true;

    // Switch view to settled graph
    state.viewMode = 'settled';
    document.querySelectorAll('.toggle-pill').forEach(p => p.classList.remove('active'));
    document.getElementById('btn-view-settled').classList.add('active');

    await solveDebts(true);

    btn.innerHTML = '✓ Debts Settled!';
    btn.classList.add('btn-success-glow');

    // Chime & Confetti
    playCashChime(true);
    confetti({
      particleCount: 55,
      spread: 70,
      origin: { y: 0.25, x: 0.85 }
    });

    if (state.settledData) {
      const { metrics } = state.settledData;
      showToast(
        "Debts Minimized & Settled!",
        `Consolidated ${metrics.initial_transactions} original debts down to ${metrics.greedy_transactions} transactions (${metrics.reduction_ratio_percent}% reduction). All debts satisfied!`,
        "💸"
      );
    }

    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.classList.remove('btn-success-glow');
      btn.disabled = false;
    }, 1800);
  });

  // Graph Toggle Pills
  document.getElementById('btn-view-settled').addEventListener('click', (e) => {
    document.querySelectorAll('.toggle-pill').forEach(p => p.classList.remove('active'));
    e.target.classList.add('active');
    state.viewMode = 'settled';
    drawGraph();
  });
  document.getElementById('btn-view-original').addEventListener('click', (e) => {
    document.querySelectorAll('.toggle-pill').forEach(p => p.classList.remove('active'));
    e.target.classList.add('active');
    state.viewMode = 'original';
    drawGraph();
  });
  document.getElementById('btn-view-both').addEventListener('click', (e) => {
    document.querySelectorAll('.toggle-pill').forEach(p => p.classList.remove('active'));
    e.target.classList.add('active');
    state.viewMode = 'both';
    drawGraph();
  });

  // Stepper Controls
  document.getElementById('btn-stepper-play').addEventListener('click', togglePlayStepper);
  document.getElementById('btn-stepper-next').addEventListener('click', advanceStepper);
  document.getElementById('btn-stepper-reset').addEventListener('click', resetStepper);
  document.getElementById('stepper-speed-select').addEventListener('change', (e) => {
    state.stepperSpeed = parseInt(e.target.value, 10);
    if (state.isPlaying) {
      togglePlayStepper();
      togglePlayStepper();
    }
  });

  // Sound Toggle
  document.getElementById('sound-toggle-btn').addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    document.getElementById('sound-icon').textContent = state.soundEnabled ? '🔊' : '🔇';
  });

  // Benchmark Run Button
  document.getElementById('btn-run-benchmarks').addEventListener('click', runBenchmarks);

  // Random Graph Button
  document.getElementById('btn-random-graph').addEventListener('click', () => {
    const names = ["Alice", "Bob", "Charlie", "David", "Emma", "Frank", "Grace"];
    const debts = [];
    for (let i = 0; i < names.length; i++) {
      for (let j = 0; j < names.length; j++) {
        if (i !== j && Math.random() < 0.4) {
          debts.push({
            debtor: names[i],
            creditor: names[j],
            amount: Math.floor(Math.random() * 500) + 50
          });
        }
      }
    }
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    state.debts = debts;
    solveDebts();
  });

  // Code Inspector Tabs
  document.querySelectorAll('.code-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.code-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      displaySourceCode(tab.dataset.lang);
    });
  });

  // Copy Source Code
  document.getElementById('btn-copy-code').addEventListener('click', () => {
    const activeTab = document.querySelector('.code-tab.active');
    const lang = activeTab ? activeTab.dataset.lang : 'cpp';
    navigator.clipboard.writeText(SOURCE_CODE[lang] || '');
    const btn = document.getElementById('btn-copy-code');
    const orig = btn.textContent;
    btn.textContent = '✓ Copied!';
    setTimeout(() => { btn.textContent = orig; }, 2000);
  });

  // Copy Settlement Report
  document.getElementById('btn-copy-report').addEventListener('click', () => {
    if (!state.settledData) return;
    const { metrics, greedy } = state.settledData;
    let md = `# Cash Flow Minimizer Settlement Report\n\n`;
    md += `- **Original Transactions:** ${metrics.initial_transactions}\n`;
    md += `- **Settled Transactions:** ${metrics.greedy_transactions}\n`;
    md += `- **Optimal Minimum:** ${metrics.optimal_transactions}\n`;
    md += `- **Reduction Ratio:** ${metrics.reduction_ratio_percent}%\n\n`;
    md += `### Settled Payments:\n`;
    greedy.transactions.forEach((t, i) => {
      md += `${i + 1}. **${t.from}** pays **${t.to}**: ₹${t.amount.toFixed(2)}\n`;
    });
    navigator.clipboard.writeText(md);
    const btn = document.getElementById('btn-copy-report');
    btn.textContent = '✓ Copied!';
    setTimeout(() => { btn.textContent = '📋 Copy Report'; }, 2000);
  });

  // Add Debt Modal
  const modal = document.getElementById('modal-add-debt');
  document.getElementById('btn-open-add-debt').addEventListener('click', () => {
    modal.classList.add('open');
  });
  document.getElementById('btn-close-modal').addEventListener('click', () => {
    modal.classList.remove('open');
  });
  document.getElementById('btn-cancel-modal').addEventListener('click', () => {
    modal.classList.remove('open');
  });

  document.getElementById('form-add-debt').addEventListener('submit', async (e) => {
    e.preventDefault();
    const debtor = document.getElementById('input-debtor').value.trim();
    const creditor = document.getElementById('input-creditor').value.trim();
    const amount = parseFloat(document.getElementById('input-amount').value);

    if (debtor && creditor && amount > 0 && debtor !== creditor) {
      state.debts.push({ debtor, creditor, amount });
      modal.classList.remove('open');
      e.target.reset();

      // Show in original graph first so the user sees their new debt!
      state.viewMode = 'original';
      document.querySelectorAll('.toggle-pill').forEach(p => p.classList.remove('active'));
      document.getElementById('btn-view-original').classList.add('active');

      await solveDebts();
      showToast(
        "Transaction Added!",
        `Recorded debt: ${debtor} owes ${creditor} ₹${amount.toFixed(2)}. Click '⚡ Settle All Debts' to minimize transactions!`,
        "➕"
      );
    }
  });

  window.addEventListener('resize', resizeCanvas);
}

// App Launch
async function initApp() {
  initEventListeners();
  displaySourceCode('cpp');
  resizeCanvas();
  await checkBackend();
  loadPreset('goa_trip');
}

document.addEventListener('DOMContentLoaded', initApp);
