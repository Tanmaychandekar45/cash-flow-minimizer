# Cash Flow Minimizer (Splitwise-style Debt Settlement)

> **Design and Analysis of Algorithms (DAA) Mini Project**  
> **Algorithmic Paradigm:** Greedy Algorithm + Max-Heaps ($O(n \log n)$) vs. Optimal Subset-Sum Formulation ($O(2^n)$)  
> **Tech Stack:** C++17 Core Engine • Python 3.11 (Flask REST API) • Modern Web Frontend (Vite, Chart.js, HTML5 Canvas)

---

## 🌟 Highlights & Features

- 🕸️ **Interactive Network Graph Visualizer**: Real-time canvas rendering of the debt multigraph before and after settlement with draggable nodes and edge flow indicators.
- 🌲 **Interactive Heap Stepper**: Step-by-step visual priority queues (Creditors Max-Heap and Debtors Max-Heap) demonstrating `heap.pop()`, $\min(\text{credit}, \text{debt})$ settlement matching, and remaining balance re-insertion.
- ⚡ **Live DAA Benchmark Lab**: Chart.js interactive charts comparing runtime complexity curves ($O(n \log n)$ vs $O(2^n)$) and empirical transaction reduction ratios (typically **60% to 95%** reduction).
- ⚖️ **Greedy vs. DP Counter-Example Explorer**: Live mathematical proof showcasing where the greedy heuristic yields $4$ transactions while exact bitmask DP achieves the theoretical minimum of $3$ transactions.
- 📜 **Formal DAA Mathematical Report**: Invariant conservation proofs ($\sum B_i = 0$), time/space complexity proofs, and NP-Hardness reduction theorem from the Subset-Sum / Partition Problem.
- 💻 **Dual Backend Support**: Native C++ compiled binary + Python Flask REST API with seamless client-side JavaScript fallback.

---

## 🚀 Quick Start Guide

### 1. Run Python Backend (Flask API)
```bash
python backend/app.py
```
*Runs on `http://127.0.0.1:5000` with CORS enabled.*

### 2. Run Interactive Web Frontend
```bash
npm run dev
```
*Open `http://localhost:5173` in your browser.*

### 3. Run Native C++ Engine Directly
```bash
g++ -O3 -std=c++17 cpp/cash_flow_minimizer.cpp -o cpp/cash_flow_minimizer.exe
./cpp/cash_flow_minimizer.exe
```

---

## 📂 Project Structure

- [`backend/app.py`](file:///c:/Users/tanma/OneDrive/Desktop/daa_mini%20project/backend/app.py) - Flask REST API server.
- [`backend/algorithms.py`](file:///c:/Users/tanma/OneDrive/Desktop/daa_mini%20project/backend/algorithms.py) - Python implementation of Greedy Max-Heaps and Bitmask Dynamic Programming.
- [`cpp/cash_flow_minimizer.cpp`](file:///c:/Users/tanma/OneDrive/Desktop/daa_mini%20project/cpp/cash_flow_minimizer.cpp) - High-performance C++ implementation with `std::priority_queue` and benchmarks.
- [`src/main.js`](file:///c:/Users/tanma/OneDrive/Desktop/daa_mini%20project/src/main.js) - Frontend controller, HTML5 canvas network visualizer, heap stepper, and Chart.js integration.
- [`src/style.css`](file:///c:/Users/tanma/OneDrive/Desktop/daa_mini%20project/src/style.css) - Modern dark-mode styling with glassmorphism and animations.
- [`index.html`](file:///c:/Users/tanma/OneDrive/Desktop/daa_mini%20project/index.html) - Application UI layout and DAA theoretical foundations.
- [`DAA_MINI_PROJECT_REPORT.md`](file:///c:/Users/tanma/OneDrive/Desktop/daa_mini%20project/DAA_MINI_PROJECT_REPORT.md) - Full technical report and algorithmic proofs.
