#include <iostream>
#include <vector>
#include <string>
#include <unordered_map>
#include <queue>
#include <cmath>
#include <iomanip>
#include <chrono>
#include <algorithm>
#include <sstream>

using namespace std;

// Structure representing an input debt edge: debtor owes creditor 'amount'
struct Debt {
    string debtor;
    string creditor;
    double amount;
};

// Structure representing a settled transaction
struct Transaction {
    string from;
    string to;
    double amount;
    string reason;
};

// Step trace for heap visualization
struct HeapStep {
    int stepNumber;
    string debtor;
    double debtAmount;
    string creditor;
    double creditAmount;
    double settledAmount;
    string remainingDebtor;
    double remainingDebt;
    string remainingCreditor;
    double remainingCredit;
};

// Person balance for priority queue
struct PersonBalance {
    string name;
    double amount;

    // For max-heap (largest amount on top)
    bool operator<(const PersonBalance& other) const {
        return amount < other.amount;
    }
};

class CashFlowMinimizer {
public:
    // 1. Compute net balance for each person
    // B_i = Incoming - Outgoing
    static unordered_map<string, double> computeNetBalances(const vector<Debt>& debts) {
        unordered_map<string, double> netBalances;
        for (const auto& d : debts) {
            netBalances[d.debtor] -= d.amount;
            netBalances[d.creditor] += d.amount;
        }
        return netBalances;
    }

    // 2. Greedy Settlement using Max-Heaps (O(n log n))
    static pair<vector<Transaction>, vector<HeapStep>> settleGreedy(
        const unordered_map<string, double>& netBalances, 
        double epsilon = 0.001
    ) {
        priority_queue<PersonBalance> creditors; // Net balance > 0 (max credit)
        priority_queue<PersonBalance> debtors;   // Absolute net balance < 0 (max debt)

        for (const auto& entry : netBalances) {
            if (entry.second > epsilon) {
                creditors.push({entry.first, entry.second});
            } else if (entry.second < -epsilon) {
                debtors.push({entry.first, -entry.second}); // Store positive magnitude
            }
        }

        vector<Transaction> transactions;
        vector<HeapStep> steps;
        int stepCount = 1;

        while (!creditors.empty() && !debtors.empty()) {
            PersonBalance maxCreditor = creditors.top();
            creditors.pop();

            PersonBalance maxDebtor = debtors.top();
            debtors.pop();

            double settledAmount = min(maxCreditor.amount, maxDebtor.amount);

            HeapStep step;
            step.stepNumber = stepCount++;
            step.debtor = maxDebtor.name;
            step.debtAmount = maxDebtor.amount;
            step.creditor = maxCreditor.name;
            step.creditAmount = maxCreditor.amount;
            step.settledAmount = settledAmount;

            transactions.push_back({
                maxDebtor.name,
                maxCreditor.name,
                settledAmount,
                "Greedy heap match (min of " + to_string(maxDebtor.amount) + " and " + to_string(maxCreditor.amount) + ")"
            });

            double remCredit = maxCreditor.amount - settledAmount;
            double remDebt = maxDebtor.amount - settledAmount;

            if (remCredit > epsilon) {
                creditors.push({maxCreditor.name, remCredit});
                step.remainingCreditor = maxCreditor.name;
                step.remainingCredit = remCredit;
            } else {
                step.remainingCreditor = "";
                step.remainingCredit = 0.0;
            }

            if (remDebt > epsilon) {
                debtors.push({maxDebtor.name, remDebt});
                step.remainingDebtor = maxDebtor.name;
                step.remainingDebt = remDebt;
            } else {
                step.remainingDebtor = "";
                step.remainingDebt = 0.0;
            }

            steps.push_back(step);
        }

        return {transactions, steps};
    }

    // 3. Optimal Subset-Sum Formulation (Dynamic Programming with Bitmask O(2^n * n))
    // Theoretical minimum transactions = n - k, where k is the max number of disjoint zero-sum subsets.
    static int optimalMinTransactionsDP(const vector<double>& nonZeroBalances, double epsilon = 0.001) {
        int n = nonZeroBalances.size();
        if (n <= 1) return 0;
        int totalMasks = 1 << n;

        // sumMask[mask] stores the sum of balances in the subset
        vector<double> sumMask(totalMasks, 0.0);
        for (int mask = 0; mask < totalMasks; ++mask) {
            double currentSum = 0.0;
            for (int i = 0; i < n; ++i) {
                if (mask & (1 << i)) {
                    currentSum += nonZeroBalances[i];
                }
            }
            sumMask[mask] = currentSum;
        }

        // dp[mask] = max number of disjoint zero-sum subsets partitionable from subset mask
        vector<int> dp(totalMasks, 0);

        for (int mask = 1; mask < totalMasks; ++mask) {
            // Option 1: inherit max from submasks
            for (int i = 0; i < n; ++i) {
                if (mask & (1 << i)) {
                    dp[mask] = max(dp[mask], dp[mask ^ (1 << i)]);
                }
            }

            // Option 2: if current subset sums to zero, it can form dp[mask ^ submask] + 1
            if (abs(sumMask[mask]) < epsilon) {
                dp[mask] = max(dp[mask], 1);
                // Check valid submask partitions
                for (int submask = (mask - 1) & mask; submask > 0; submask = (submask - 1) & mask) {
                    if (abs(sumMask[submask]) < epsilon && dp[submask] > 0 && dp[mask ^ submask] > 0) {
                        dp[mask] = max(dp[mask], dp[submask] + dp[mask ^ submask]);
                    }
                }
            }
        }

        int maxZeroSumSubsets = dp[totalMasks - 1];
        if (maxZeroSumSubsets == 0) maxZeroSumSubsets = 1; // At least entire group sums to 0

        // Minimum transactions = n - k
        return n - maxZeroSumSubsets;
    }
};

int main(int argc, char* argv[]) {
    cout << "========================================================\n";
    cout << "  CASH FLOW MINIMIZER: DAA MINI PROJECT (C++ CORE)     \n";
    cout << "  Greedy (Heaps) O(n log n) vs Optimal DP O(2^n)       \n";
    cout << "========================================================\n\n";

    // Sample Problem: Goa Trip Expense
    vector<Debt> sampleDebts = {
        {"Alice", "Bob", 400.0},
        {"Bob", "Charlie", 200.0},
        {"Charlie", "Alice", 100.0},
        {"David", "Alice", 300.0},
        {"David", "Bob", 200.0},
        {"Emma", "David", 250.0},
        {"Emma", "Charlie", 150.0}
    };

    cout << "Input Transactions (" << sampleDebts.size() << " original debts):\n";
    for (const auto& d : sampleDebts) {
        cout << "  " << left << setw(10) << d.debtor << " -> owes " << setw(10) << d.creditor << ": ₹" << fixed << setprecision(2) << d.amount << "\n";
    }

    // Step 1: Compute Net Balances
    auto netBalances = CashFlowMinimizer::computeNetBalances(sampleDebts);
    cout << "\nComputed Net Balances (B_i = Incoming - Outgoing):\n";
    vector<double> nonZeroList;
    for (const auto& entry : netBalances) {
        cout << "  " << left << setw(10) << entry.first << ": " << (entry.second >= 0 ? "+₹" : "-₹") << abs(entry.second) << "\n";
        if (abs(entry.second) > 0.001) {
            nonZeroList.push_back(entry.second);
        }
    }

    // Step 2: Greedy Settlement with Heaps
    auto startGreedy = chrono::high_resolution_clock::now();
    auto result = CashFlowMinimizer::settleGreedy(netBalances);
    auto endGreedy = chrono::high_resolution_clock::now();
    auto greedyDuration = chrono::duration_cast<chrono::nanoseconds>(endGreedy - startGreedy).count();

    cout << "\nGreedy Heap Settlement Steps:\n";
    for (const auto& step : result.second) {
        cout << "  Step " << step.stepNumber << ": Max Debtor [" << step.debtor << " (₹" << step.debtAmount 
             << ")] pays Max Creditor [" << step.creditor << " (₹" << step.creditAmount << ")] -> Settle: ₹" << step.settledAmount << "\n";
    }

    cout << "\nFinal Settled Transactions (" << result.first.size() << " transactions):\n";
    for (const auto& t : result.first) {
        cout << "  -> " << left << setw(10) << t.from << " pays " << setw(10) << t.to << ": ₹" << t.amount << "\n";
    }

    // Step 3: Optimal DP
    auto startDP = chrono::high_resolution_clock::now();
    int optimalTransactions = CashFlowMinimizer::optimalMinTransactionsDP(nonZeroList);
    auto endDP = chrono::high_resolution_clock::now();
    auto dpDuration = chrono::duration_cast<chrono::nanoseconds>(endDP - startDP).count();

    cout << "\nDAA Analysis & Performance Highlights:\n";
    cout << "  Original Edge Count        : " << sampleDebts.size() << "\n";
    cout << "  Greedy Transactions        : " << result.first.size() << "\n";
    cout << "  DP Optimal Min Transactions: " << optimalTransactions << "\n";
    double reduction = ((double)(sampleDebts.size() - result.first.size()) / sampleDebts.size()) * 100.0;
    cout << "  Transaction Reduction Ratio : " << fixed << setprecision(1) << reduction << "%\n";
    cout << "  Greedy Execution Time       : " << greedyDuration << " ns (" << (greedyDuration / 1e6) << " ms)\n";
    cout << "  DP Execution Time           : " << dpDuration << " ns (" << (dpDuration / 1e6) << " ms)\n";

    return 0;
}
