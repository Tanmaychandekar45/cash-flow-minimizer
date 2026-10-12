import os
import sys
import subprocess
import json
import random
from flask import Flask, request, jsonify
from flask_cors import CORS
from algorithms import compute_net_balances, settle_greedy, solve_exact_dp, run_comparative_benchmark

app = Flask(__name__)
CORS(app)  # Enable CORS for Vite dev server and local clients

CPP_BINARY_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "cpp", "cash_flow_minimizer.exe"))

# Curated presets demonstrating DAA principles
PRESETS = {
    "goa_trip": {
        "title": "Goa Trip Expense (Classic Splitwise)",
        "description": "5 friends with inter-connected travel, hotel, food, and cab expenses.",
        "debts": [
            {"debtor": "Alice", "creditor": "Bob", "amount": 400.0},
            {"debtor": "Bob", "creditor": "Charlie", "amount": 200.0},
            {"debtor": "Charlie", "creditor": "Alice", "amount": 100.0},
            {"debtor": "David", "creditor": "Alice", "amount": 300.0},
            {"debtor": "David", "creditor": "Bob", "amount": 200.0},
            {"debtor": "Emma", "creditor": "David", "amount": 250.0},
            {"debtor": "Emma", "creditor": "Charlie", "amount": 150.0}
        ]
    },
    "counter_example": {
        "title": "Greedy vs DP Counter-Example (Sub-optimality)",
        "description": "Mathematical proof case where Greedy produces 4 transactions, but Exact DP produces 3!",
        "debts": [
            # Balances result in Creditors: {A: +4, B: +3, C: +2}, Debtors: {D: -5, E: -4}
            # Zero-sum partitions: {C(+2), B(+3), D(-5)} = 0, and {A(+4), E(-4)} = 0.
            # Optimal transactions = 5 - 2 = 3. Greedy results in 4 transactions!
            {"debtor": "Dave", "creditor": "Alice", "amount": 4.0},
            {"debtor": "Dave", "creditor": "Bob", "amount": 1.0},
            {"debtor": "Evan", "creditor": "Bob", "amount": 2.0},
            {"debtor": "Evan", "creditor": "Charlie", "amount": 2.0}
        ]
    },
    "circular_loop": {
        "title": "Circular Debt Loop (Zero Net Balance)",
        "description": "A owes B, B owes C, C owes D, D owes A. Perfectly cancels out into 0 transactions!",
        "debts": [
            {"debtor": "Liam", "creditor": "Noah", "amount": 150.0},
            {"debtor": "Noah", "creditor": "Oliver", "amount": 150.0},
            {"debtor": "Oliver", "creditor": "Sophia", "amount": 150.0},
            {"debtor": "Sophia", "creditor": "Liam", "amount": 150.0}
        ]
    },
    "roommates": {
        "title": "Apartment Roommates (Monthly Split)",
        "description": "Rent, Wi-Fi, Groceries, and Utilities split among 4 flatmates.",
        "debts": [
            {"debtor": "Rahul", "creditor": "Ananya", "amount": 1200.0},
            {"debtor": "Ananya", "creditor": "Vikram", "amount": 600.0},
            {"debtor": "Priya", "creditor": "Rahul", "amount": 450.0},
            {"debtor": "Vikram", "creditor": "Priya", "amount": 300.0},
            {"debtor": "Rahul", "creditor": "Vikram", "amount": 500.0}
        ]
    },
    "complex_mesh": {
        "title": "Dense College Fest Mesh (8 People)",
        "description": "Heavy debt multigraph with 14 pairwise debts, drastically simplified.",
        "debts": [
            {"debtor": "Aarav", "creditor": "Diya", "amount": 550.0},
            {"debtor": "Diya", "creditor": "Ishaan", "amount": 420.0},
            {"debtor": "Ishaan", "creditor": "Kavya", "amount": 600.0},
            {"debtor": "Kavya", "creditor": "Manav", "amount": 310.0},
            {"debtor": "Manav", "creditor": "Neha", "amount": 750.0},
            {"debtor": "Neha", "creditor": "Rohan", "amount": 290.0},
            {"debtor": "Rohan", "creditor": "Sneha", "amount": 480.0},
            {"debtor": "Sneha", "creditor": "Aarav", "amount": 630.0},
            {"debtor": "Aarav", "creditor": "Ishaan", "amount": 200.0},
            {"debtor": "Diya", "creditor": "Kavya", "amount": 150.0},
            {"debtor": "Ishaan", "creditor": "Manav", "amount": 180.0},
            {"debtor": "Kavya", "creditor": "Rohan", "amount": 350.0},
            {"debtor": "Manav", "creditor": "Sneha", "amount": 220.0},
            {"debtor": "Neha", "creditor": "Aarav", "amount": 400.0}
        ]
    }
}

@app.route('/api/health', methods=['GET'])
def health():
    cpp_exists = os.path.exists(CPP_BINARY_PATH)
    return jsonify({
        "status": "healthy",
        "service": "Cash Flow Minimizer DAA Engine",
        "backend": "Python 3.11 (Flask) + C++ MSYS2",
        "cpp_executable_present": cpp_exists
    })

@app.route('/api/presets', methods=['GET'])
def get_presets():
    return jsonify(PRESETS)

@app.route('/api/settle', methods=['POST'])
def settle():
    data = request.get_json() or {}
    debts = data.get("debts", [])

    if not debts:
        return jsonify({"error": "No debts provided"}), 400

    # 1. Net balances
    net_balances = compute_net_balances(debts)
    original_edge_count = len(debts)

    # 2. Greedy Heap Settlement
    greedy_result = settle_greedy(net_balances)
    greedy_count = greedy_result["transaction_count"]

    # 3. Exact DP Formulation
    dp_result = solve_exact_dp(net_balances)
    dp_count = dp_result["optimal_transactions"]

    # Calculate metrics
    reduction_ratio = 0.0
    if original_edge_count > 0:
        reduction_ratio = round(((original_edge_count - greedy_count) / original_edge_count) * 100.0, 1)

    # Check optimality
    is_greedy_optimal = (greedy_count == dp_count)
    difference = greedy_count - dp_count

    return jsonify({
        "net_balances": net_balances,
        "original_edge_count": original_edge_count,
        "greedy": greedy_result,
        "dp": dp_result,
        "metrics": {
            "initial_transactions": original_edge_count,
            "greedy_transactions": greedy_count,
            "optimal_transactions": dp_count,
            "reduction_ratio_percent": reduction_ratio,
            "is_greedy_optimal": is_greedy_optimal,
            "transactions_difference": difference
        }
    })

@app.route('/api/benchmark', methods=['POST'])
def benchmark():
    data = request.get_json() or {}
    n_values = data.get("sizes", [4, 6, 8, 10, 12, 14, 16])
    results = run_comparative_benchmark(n_values)
    return jsonify({"benchmarks": results})

@app.route('/api/random-graph', methods=['POST'])
def random_graph():
    data = request.get_json() or {}
    n = int(data.get("num_people", 6))
    density = float(data.get("density", 0.5))

    names = ["Alice", "Bob", "Charlie", "David", "Emma", "Frank", "Grace", "Henry", "Ivy", "Jack", "Karan", "Luna"]
    if n > len(names):
        names = [f"Person_{i+1}" for i in range(n)]
    else:
        names = names[:n]

    debts = []
    for i in range(n):
        for j in range(n):
            if i != j and random.random() < density:
                amt = random.randint(50, 800)
                debts.append({"debtor": names[i], "creditor": names[j], "amount": float(amt)})

    if not debts: # Ensure at least 1 debt
        debts.append({"debtor": names[0], "creditor": names[1], "amount": 100.0})

    return jsonify({"debts": debts})

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    print(f"[*] Starting Cash Flow Minimizer Python Flask Backend on port {port}...")
    app.run(host='0.0.0.0', port=port, debug=True)
