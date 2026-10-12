import heapq
import time
import math
from typing import List, Dict, Tuple, Any

def compute_net_balances(debts: List[Dict[str, Any]]) -> Dict[str, float]:
    """
    Computes net balance B_i = Incoming - Outgoing for each participant.
    Incoming = others owe person (credit)
    Outgoing = person owes others (debt)
    """
    balances = {}
    for debt in debts:
        debtor = str(debt["debtor"]).strip()
        creditor = str(debt["creditor"]).strip()
        amount = float(debt["amount"])

        balances[debtor] = balances.get(debtor, 0.0) - amount
        balances[creditor] = balances.get(creditor, 0.0) + amount

    # Round to avoid floating point precision issues
    return {k: round(v, 2) for k, v in balances.items()}

def settle_greedy(net_balances: Dict[str, float], epsilon: float = 0.01) -> Dict[str, Any]:
    """
    Greedy debt settlement using two Max-Heaps.
    - Creditors Max-Heap: stores (amount, name) where balance > 0
    - Debtors Max-Heap: stores (amount, name) where balance < 0 (using absolute debt)
    Time Complexity: O(n log n)
    Space Complexity: O(n)
    Returns:
      - transactions: list of settled transactions {from, to, amount}
      - heap_steps: step-by-step trace of heap operations for visual stepper
    """
    start_time = time.perf_counter()

    # In Python, heapq is min-heap, so we store negative values for max-heap behavior
    creditors = []  # (-credit, name)
    debtors = []    # (-debt, name)

    for name, balance in net_balances.items():
        if balance > epsilon:
            heapq.heappush(creditors, (-balance, name))
        elif balance < -epsilon:
            heapq.heappush(debtors, (balance, name))  # balance is negative, so this acts as max debt

    transactions = []
    heap_steps = []
    step_num = 1

    # Snapshot of initial heaps
    initial_creditors = [{"name": name, "amount": round(-val, 2)} for val, name in sorted(creditors)]
    initial_debtors = [{"name": name, "amount": round(-val, 2)} for val, name in sorted(debtors)]

    while creditors and debtors:
        neg_credit, creditor = heapq.heappop(creditors)
        neg_debt, debtor = heapq.heappop(debtors)

        credit_val = round(-neg_credit, 2)
        debt_val = round(-neg_debt, 2)

        settled = min(credit_val, debt_val)
        settled = round(settled, 2)

        transactions.append({
            "from": debtor,
            "to": creditor,
            "amount": settled,
            "rule": f"Greedy match: min(Credit ₹{credit_val}, Debt ₹{debt_val}) = ₹{settled}"
        })

        rem_credit = round(credit_val - settled, 2)
        rem_debt = round(debt_val - settled, 2)

        step_record = {
            "step": step_num,
            "debtor": debtor,
            "debt": debt_val,
            "creditor": creditor,
            "credit": credit_val,
            "settled": settled,
            "remaining_debtor": debtor if rem_debt > epsilon else None,
            "remaining_debt": rem_debt if rem_debt > epsilon else 0.0,
            "remaining_creditor": creditor if rem_credit > epsilon else None,
            "remaining_credit": rem_credit if rem_credit > epsilon else 0.0,
            "current_creditors_heap": [{"name": n, "amount": round(-v, 2)} for v, n in creditors],
            "current_debtors_heap": [{"name": n, "amount": round(-v, 2)} for v, n in debtors]
        }

        if rem_credit > epsilon:
            heapq.heappush(creditors, (-rem_credit, creditor))
        if rem_debt > epsilon:
            heapq.heappush(debtors, (-rem_debt, debtor))

        heap_steps.append(step_record)
        step_num += 1

    elapsed_ms = (time.perf_counter() - start_time) * 1000.0

    return {
        "transactions": transactions,
        "steps": heap_steps,
        "initial_creditors": initial_creditors,
        "initial_debtors": initial_debtors,
        "transaction_count": len(transactions),
        "execution_time_ms": round(elapsed_ms, 4)
    }

def solve_exact_dp(net_balances: Dict[str, float], epsilon: float = 0.01) -> Dict[str, Any]:
    """
    Exact optimal solution using Dynamic Programming with Bitmask (Subset Sum Formulation).
    Theoretical Result:
    The optimal number of transactions is: (N - k),
    where k is the maximum number of disjoint subsets whose balances sum to 0.
    Time Complexity: O(2^n * n) or O(3^n)
    Space Complexity: O(2^n)
    Feasible for n <= 20.
    """
    start_time = time.perf_counter()

    # Filter out persons with zero net balance
    active_persons = [(name, bal) for name, bal in net_balances.items() if abs(bal) > epsilon]
    n = len(active_persons)

    if n <= 1:
        return {
            "optimal_transactions": 0,
            "max_zero_sum_subsets": 0,
            "subsets": [],
            "execution_time_ms": round((time.perf_counter() - start_time) * 1000.0, 4)
        }

    total_masks = 1 << n
    names = [p[0] for p in active_persons]
    balances = [p[1] for p in active_persons]

    # Precompute subset sums
    subset_sums = [0.0] * total_masks
    for mask in range(total_masks):
        s = 0.0
        for i in range(n):
            if mask & (1 << i):
                s += balances[i]
        subset_sums[mask] = round(s, 2)

    # dp[mask] = max number of disjoint zero-sum subsets within mask
    dp = [0] * total_masks
    best_prev = [-1] * total_masks

    # We iterate over all masks
    for mask in range(1, total_masks):
        # 1. Inherit from submasks with one bit removed
        for i in range(n):
            if mask & (1 << i):
                if dp[mask ^ (1 << i)] > dp[mask]:
                    dp[mask] = dp[mask ^ (1 << i)]
                    best_prev[mask] = mask ^ (1 << i)

        # 2. If current mask itself sums to 0, it can form 1 zero-sum group or merge subpartitions
        if abs(subset_sums[mask]) < epsilon:
            if dp[mask] == 0:
                dp[mask] = 1
                best_prev[mask] = 0

            # Check submask combinations
            submask = (mask - 1) & mask
            while submask > 0:
                if abs(subset_sums[submask]) < epsilon and dp[submask] > 0 and dp[mask ^ submask] > 0:
                    if dp[submask] + dp[mask ^ submask] > dp[mask]:
                        dp[mask] = dp[submask] + dp[mask ^ submask]
                        best_prev[mask] = submask
                submask = (submask - 1) & mask

    k = max(1, dp[total_masks - 1])
    optimal_transactions = n - k
    elapsed_ms = (time.perf_counter() - start_time) * 1000.0

    # Extract disjoint zero-sum subsets
    zero_sum_subsets = []
    # Find all minimal zero-sum subsets covering the partition
    mask = total_masks - 1
    # Simple reconstruction of zero-sum groups
    visited_mask = set()
    for m in range(1, total_masks):
        if abs(subset_sums[m]) < epsilon:
            group = [names[i] for i in range(n) if m & (1 << i)]
            if len(group) > 1:
                zero_sum_subsets.append({
                    "members": group,
                    "balances": {names[i]: balances[i] for i in range(n) if m & (1 << i)}
                })
        if len(zero_sum_subsets) >= k:
            break

    return {
        "optimal_transactions": optimal_transactions,
        "max_zero_sum_subsets": k,
        "active_participants_count": n,
        "execution_time_ms": round(elapsed_ms, 4)
    }

def run_comparative_benchmark(n_values: List[int] = None) -> List[Dict[str, Any]]:
    """
    Runs live empirical benchmarks comparing Greedy O(n log n) vs DP O(2^n)
    across different graph sizes.
    """
    import random
    if n_values is None:
        n_values = [4, 6, 8, 10, 12, 14, 16]

    results = []

    for n in n_values:
        names = [f"P{i+1}" for i in range(n)]
        debts = []
        # Generate random dense debt graph
        for i in range(n):
            for j in range(i + 1, n):
                if random.random() < 0.6:
                    amt = random.randint(20, 200)
                    debts.append({"debtor": names[i], "creditor": names[j], "amount": amt})

        net_bals = compute_net_balances(debts)
        orig_edges = len(debts)

        greedy_res = settle_greedy(net_bals)
        greedy_time = greedy_res["execution_time_ms"]
        greedy_tx = greedy_res["transaction_count"]

        # DP exact only for n <= 16
        dp_time = None
        dp_tx = None
        if n <= 16:
            dp_res = solve_exact_dp(net_bals)
            dp_time = dp_res["execution_time_ms"]
            dp_tx = dp_res["optimal_transactions"]

        reduction_ratio = round(((orig_edges - greedy_tx) / orig_edges) * 100.0, 1) if orig_edges > 0 else 0

        results.append({
            "n": n,
            "original_edges": orig_edges,
            "greedy_transactions": greedy_tx,
            "dp_transactions": dp_tx,
            "greedy_time_ms": greedy_time,
            "dp_time_ms": dp_time,
            "reduction_ratio": reduction_ratio
        })

    return results
