import { BugHuntLanguageCode, BugHuntPlantedBug } from '@ignitron/shared';

export const ROUND2_SUPPORTED_LANGUAGES: BugHuntLanguageCode[] = [
  'c',
  'cpp',
  'java',
  'python',
];

export const OFFICIAL_ROUND2_TITLE = 'Bug Hunt: Student Result Analyzer';

export const OFFICIAL_ROUND2_DESCRIPTION = `### Challenge Overview
A college uses a Student Result Analyzer program to evaluate student performance across three subjects.
The program reads three integer marks (each between 0 and 100) and prints:
1. **Total marks** (sum of all three subjects)
2. **Average marks** (total divided by 3, formatted to 2 decimal places)
3. **Highest subject mark** (maximum of the three marks)
4. **Final Result** (\`PASS\` only if **every** subject mark is \`>= 35\`, otherwise \`FAIL\`)

### Your Objectives:
1. **Bug Investigation (20 Marks):** Inspect the faulty starter code and click the **4 logical defects** (5 marks each).
2. **Code Repair & Verification (80 Marks):** Fix all four defects in your selected language, pass the sample tests, and submit for hidden evaluation.

### Rubric Breakdown:
- **Bug Identification & Isolation:** 20 Marks (4 × 5 Marks)
- **Test Correctness & Passing Suite:** 50 Marks
- **Boundary & Edge Case Handling:** 20 Marks
- **Code Cleanliness & Documentation:** 10 Marks`;

// ----------------------------------------------------------------------------
// STARTER CODE (< 50 PHYSICAL LINES PER LANGUAGE)
// ----------------------------------------------------------------------------

export const OFFICIAL_ROUND2_C_STARTER = `#include <stdio.h>

int main() {
    int mark1, mark2, mark3;
    if (scanf("%d %d %d", &mark1, &mark2, &mark3) != 3) {
        return 0;
    }

    int total = mark1 + mark2;
    double average = total / 2.0;
    int highest = (mark1 < mark2) ? (mark1 < mark3 ? mark1 : mark3) : (mark2 < mark3 ? mark2 : mark3);
    int passed = (mark1 >= 35 || mark2 >= 35 || mark3 >= 35);

    printf("Total: %d\\n", total);
    printf("Average: %.2f\\n", average);
    printf("Highest: %d\\n", highest);
    printf("Result: %s\\n", passed ? "PASS" : "FAIL");

    return 0;
}`;

export const OFFICIAL_ROUND2_CPP_STARTER = `#include <iostream>
#include <iomanip>
#include <algorithm>
using namespace std;

int main() {
    int mark1, mark2, mark3;
    if (!(cin >> mark1 >> mark2 >> mark3)) return 0;

    int total = mark1 + mark2;
    double average = total / 2.0;
    int highest = min({mark1, mark2, mark3});
    bool passed = (mark1 >= 35 || mark2 >= 35 || mark3 >= 35);

    cout << "Total: " << total << "\\n";
    cout << "Average: " << fixed << setprecision(2) << average << "\\n";
    cout << "Highest: " << highest << "\\n";
    cout << "Result: " << (passed ? "PASS" : "FAIL") << "\\n";

    return 0;
}`;

export const OFFICIAL_ROUND2_JAVA_STARTER = `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (!sc.hasNextInt()) return;
        int mark1 = sc.nextInt();
        int mark2 = sc.nextInt();
        int mark3 = sc.nextInt();

        int total = mark1 + mark2;
        double average = total / 2.0;
        int highest = Math.min(mark1, Math.min(mark2, mark3));
        boolean passed = (mark1 >= 35 || mark2 >= 35 || mark3 >= 35);

        System.out.println("Total: " + total);
        System.out.printf("Average: %.2f%n", average);
        System.out.println("Highest: " + highest);
        System.out.println("Result: " + (passed ? "PASS" : "FAIL"));
    }
}`;

export const OFFICIAL_ROUND2_PYTHON_STARTER = `def analyze_result():
    marks = input().split()
    mark1 = int(marks[0])
    mark2 = int(marks[1])
    mark3 = int(marks[2])

    total = mark1 + mark2
    average = total / 2.0
    highest = min(mark1, mark2, mark3)
    passed = mark1 >= 35 or mark2 >= 35 or mark3 >= 35

    result = "PASS" if passed else "FAIL"

    print(f"Total: {total}")
    print(f"Average: {average:.2f}")
    print(f"Highest: {highest}")
    print(f"Result: {result}")


if __name__ == "__main__":
    analyze_result()`;

export const OFFICIAL_ROUND2_LANGUAGE_STARTERS: Partial<Record<BugHuntLanguageCode, string>> = {
  c: OFFICIAL_ROUND2_C_STARTER,
  cpp: OFFICIAL_ROUND2_CPP_STARTER,
  java: OFFICIAL_ROUND2_JAVA_STARTER,
  python: OFFICIAL_ROUND2_PYTHON_STARTER,
};

// ----------------------------------------------------------------------------
// EXACT BUG COORDINATE RESOLVER (NO GUESSING)
// ----------------------------------------------------------------------------

function buildBug(
  source: string,
  spec: {
    key: string;
    name: string;
    description: string;
    expression: string;
    correctedExpression: string;
    acceptableTokens: string[];
    repairValidationTestIndices: number[];
    marks?: number;
  },
): BugHuntPlantedBug {
  const startOffset = source.indexOf(spec.expression);
  if (startOffset === -1) {
    throw new Error(`Bug expression "${spec.expression}" not found in starter source.`);
  }
  const endOffset = startOffset + spec.expression.length;
  const lineNumber = source.slice(0, startOffset).split('\n').length;

  return {
    key: spec.key,
    name: spec.name,
    description: spec.description,
    lineNumber,
    expression: spec.expression,
    startOffset,
    endOffset,
    correctedExpression: spec.correctedExpression,
    marks: spec.marks ?? 5,
    repairValidationTestIndices: spec.repairValidationTestIndices,
    acceptableTokens: Array.from(new Set([spec.expression, ...spec.acceptableTokens])),
  };
}

export const OFFICIAL_ROUND2_LANGUAGE_BUGS: Partial<Record<BugHuntLanguageCode, BugHuntPlantedBug[]>> = {
  c: [
    buildBug(OFFICIAL_ROUND2_C_STARTER, {
      key: 'BUG_TOTAL_CALCULATION',
      name: 'Incorrect Total Calculation',
      description: 'Total marks only adds mark1 and mark2, omitting mark3.',
      expression: 'int total = mark1 + mark2;',
      correctedExpression: 'int total = mark1 + mark2 + mark3;',
      acceptableTokens: ['mark1 + mark2', 'mark1 + mark2;'],
      repairValidationTestIndices: [0],
    }),
    buildBug(OFFICIAL_ROUND2_C_STARTER, {
      key: 'BUG_AVERAGE_CALCULATION',
      name: 'Incorrect Average Calculation',
      description: 'Average divides total by 2.0 instead of 3.0 for three subjects.',
      expression: 'double average = total / 2.0;',
      correctedExpression: 'double average = total / 3.0;',
      acceptableTokens: ['total / 2.0', 'total / 2.0;', '2.0'],
      repairValidationTestIndices: [1],
    }),
    buildBug(OFFICIAL_ROUND2_C_STARTER, {
      key: 'BUG_HIGHEST_MARK',
      name: 'Incorrect Highest Mark Calculation',
      description: 'Highest mark computes the minimum of the three marks instead of the maximum.',
      expression: 'int highest = (mark1 < mark2) ? (mark1 < mark3 ? mark1 : mark3) : (mark2 < mark3 ? mark2 : mark3);',
      correctedExpression: 'int highest = (mark1 > mark2) ? (mark1 > mark3 ? mark1 : mark3) : (mark2 > mark3 ? mark2 : mark3);',
      acceptableTokens: [
        '(mark1 < mark2) ? (mark1 < mark3 ? mark1 : mark3) : (mark2 < mark3 ? mark2 : mark3)',
        'mark1 < mark2',
        'mark1 < mark3',
        'mark2 < mark3',
      ],
      repairValidationTestIndices: [2],
    }),
    buildBug(OFFICIAL_ROUND2_C_STARTER, {
      key: 'BUG_PASS_FAIL_CONDITION',
      name: 'Incorrect Pass/Fail Condition',
      description: 'Passing condition uses logical OR (||) instead of logical AND (&&), allowing failure in individual subjects to pass.',
      expression: 'int passed = (mark1 >= 35 || mark2 >= 35 || mark3 >= 35);',
      correctedExpression: 'int passed = (mark1 >= 35 && mark2 >= 35 && mark3 >= 35);',
      acceptableTokens: [
        'mark1 >= 35 || mark2 >= 35 || mark3 >= 35',
        '(mark1 >= 35 || mark2 >= 35 || mark3 >= 35)',
        '||',
      ],
      repairValidationTestIndices: [3],
    }),
  ],
  cpp: [
    buildBug(OFFICIAL_ROUND2_CPP_STARTER, {
      key: 'BUG_TOTAL_CALCULATION',
      name: 'Incorrect Total Calculation',
      description: 'Total marks only adds mark1 and mark2, omitting mark3.',
      expression: 'int total = mark1 + mark2;',
      correctedExpression: 'int total = mark1 + mark2 + mark3;',
      acceptableTokens: ['mark1 + mark2', 'mark1 + mark2;'],
      repairValidationTestIndices: [0],
    }),
    buildBug(OFFICIAL_ROUND2_CPP_STARTER, {
      key: 'BUG_AVERAGE_CALCULATION',
      name: 'Incorrect Average Calculation',
      description: 'Average divides total by 2.0 instead of 3.0 for three subjects.',
      expression: 'double average = total / 2.0;',
      correctedExpression: 'double average = total / 3.0;',
      acceptableTokens: ['total / 2.0', 'total / 2.0;', '2.0'],
      repairValidationTestIndices: [1],
    }),
    buildBug(OFFICIAL_ROUND2_CPP_STARTER, {
      key: 'BUG_HIGHEST_MARK',
      name: 'Incorrect Highest Mark Calculation',
      description: 'Highest mark uses min(...) instead of max(...).',
      expression: 'int highest = min({mark1, mark2, mark3});',
      correctedExpression: 'int highest = max({mark1, mark2, mark3});',
      acceptableTokens: ['min({mark1, mark2, mark3})', 'min({mark1, mark2, mark3});', 'min'],
      repairValidationTestIndices: [2],
    }),
    buildBug(OFFICIAL_ROUND2_CPP_STARTER, {
      key: 'BUG_PASS_FAIL_CONDITION',
      name: 'Incorrect Pass/Fail Condition',
      description: 'Passing condition uses logical OR (||) instead of logical AND (&&).',
      expression: 'bool passed = (mark1 >= 35 || mark2 >= 35 || mark3 >= 35);',
      correctedExpression: 'bool passed = (mark1 >= 35 && mark2 >= 35 && mark3 >= 35);',
      acceptableTokens: [
        'mark1 >= 35 || mark2 >= 35 || mark3 >= 35',
        '(mark1 >= 35 || mark2 >= 35 || mark3 >= 35)',
        '||',
      ],
      repairValidationTestIndices: [3],
    }),
  ],
  java: [
    buildBug(OFFICIAL_ROUND2_JAVA_STARTER, {
      key: 'BUG_TOTAL_CALCULATION',
      name: 'Incorrect Total Calculation',
      description: 'Total marks only adds mark1 and mark2, omitting mark3.',
      expression: 'int total = mark1 + mark2;',
      correctedExpression: 'int total = mark1 + mark2 + mark3;',
      acceptableTokens: ['mark1 + mark2', 'mark1 + mark2;'],
      repairValidationTestIndices: [0],
    }),
    buildBug(OFFICIAL_ROUND2_JAVA_STARTER, {
      key: 'BUG_AVERAGE_CALCULATION',
      name: 'Incorrect Average Calculation',
      description: 'Average divides total by 2.0 instead of 3.0 for three subjects.',
      expression: 'double average = total / 2.0;',
      correctedExpression: 'double average = total / 3.0;',
      acceptableTokens: ['total / 2.0', 'total / 2.0;', '2.0'],
      repairValidationTestIndices: [1],
    }),
    buildBug(OFFICIAL_ROUND2_JAVA_STARTER, {
      key: 'BUG_HIGHEST_MARK',
      name: 'Incorrect Highest Mark Calculation',
      description: 'Highest mark uses Math.min(...) instead of Math.max(...).',
      expression: 'int highest = Math.min(mark1, Math.min(mark2, mark3));',
      correctedExpression: 'int highest = Math.max(mark1, Math.max(mark2, mark3));',
      acceptableTokens: [
        'Math.min(mark1, Math.min(mark2, mark3))',
        'Math.min(mark1, Math.min(mark2, mark3));',
        'Math.min',
      ],
      repairValidationTestIndices: [2],
    }),
    buildBug(OFFICIAL_ROUND2_JAVA_STARTER, {
      key: 'BUG_PASS_FAIL_CONDITION',
      name: 'Incorrect Pass/Fail Condition',
      description: 'Passing condition uses logical OR (||) instead of logical AND (&&).',
      expression: 'boolean passed = (mark1 >= 35 || mark2 >= 35 || mark3 >= 35);',
      correctedExpression: 'boolean passed = (mark1 >= 35 && mark2 >= 35 && mark3 >= 35);',
      acceptableTokens: [
        'mark1 >= 35 || mark2 >= 35 || mark3 >= 35',
        '(mark1 >= 35 || mark2 >= 35 || mark3 >= 35)',
        '||',
      ],
      repairValidationTestIndices: [3],
    }),
  ],
  python: [
    buildBug(OFFICIAL_ROUND2_PYTHON_STARTER, {
      key: 'BUG_TOTAL_CALCULATION',
      name: 'Incorrect Total Calculation',
      description: 'Total marks only adds mark1 and mark2, omitting mark3.',
      expression: 'total = mark1 + mark2',
      correctedExpression: 'total = mark1 + mark2 + mark3',
      acceptableTokens: ['mark1 + mark2'],
      repairValidationTestIndices: [0],
    }),
    buildBug(OFFICIAL_ROUND2_PYTHON_STARTER, {
      key: 'BUG_AVERAGE_CALCULATION',
      name: 'Incorrect Average Calculation',
      description: 'Average divides total by 2.0 instead of 3.0 for three subjects.',
      expression: 'average = total / 2.0',
      correctedExpression: 'average = total / 3.0',
      acceptableTokens: ['total / 2.0', '2.0'],
      repairValidationTestIndices: [1],
    }),
    buildBug(OFFICIAL_ROUND2_PYTHON_STARTER, {
      key: 'BUG_HIGHEST_MARK',
      name: 'Incorrect Highest Mark Calculation',
      description: 'Highest mark uses min(...) instead of max(...).',
      expression: 'highest = min(mark1, mark2, mark3)',
      correctedExpression: 'highest = max(mark1, mark2, mark3)',
      acceptableTokens: ['min(mark1, mark2, mark3)', 'min'],
      repairValidationTestIndices: [2],
    }),
    buildBug(OFFICIAL_ROUND2_PYTHON_STARTER, {
      key: 'BUG_PASS_FAIL_CONDITION',
      name: 'Incorrect Pass/Fail Condition',
      description: 'Passing condition uses logical "or" instead of logical "and".',
      expression: 'passed = mark1 >= 35 or mark2 >= 35 or mark3 >= 35',
      correctedExpression: 'passed = mark1 >= 35 and mark2 >= 35 and mark3 >= 35',
      acceptableTokens: ['mark1 >= 35 or mark2 >= 35 or mark3 >= 35', ' or '],
      repairValidationTestIndices: [3],
    }),
  ],
};

// ----------------------------------------------------------------------------
// OFFICIAL 8 TEST CASES (2 SAMPLE + 6 HIDDEN) & PER-BUG VERIFICATION
// ----------------------------------------------------------------------------

export const OFFICIAL_ROUND2_SAMPLE_TESTS = [
  {
    stdin: '80 70 90',
    expectedOutput: 'Total: 240\nAverage: 80.00\nHighest: 90\nResult: PASS',
    explanation: 'All three marks are >= 35. Total = 240, Average = 80.00, Highest = 90, Result = PASS.',
  },
  {
    stdin: '90 30 90',
    expectedOutput: 'Total: 210\nAverage: 70.00\nHighest: 90\nResult: FAIL',
    explanation: 'Second mark (30) is below 35, so overall result must be FAIL.',
  },
];

export const OFFICIAL_ROUND2_HIDDEN_TESTS = [
  {
    stdin: '35 35 35',
    expectedOutput: 'Total: 105\nAverage: 35.00\nHighest: 35\nResult: PASS',
    marks: 10,
    isEdgeCase: true,
    explanation: 'Exact passing threshold boundary (35 in all subjects).',
  },
  {
    stdin: '0 0 0',
    expectedOutput: 'Total: 0\nAverage: 0.00\nHighest: 0\nResult: FAIL',
    marks: 10,
    isEdgeCase: true,
    explanation: 'Zero scores across all subjects.',
  },
  {
    stdin: '100 100 100',
    expectedOutput: 'Total: 300\nAverage: 100.00\nHighest: 100\nResult: PASS',
    marks: 10,
    isEdgeCase: false,
    explanation: 'Maximum marks across all subjects.',
  },
  {
    stdin: '34 100 100',
    expectedOutput: 'Total: 234\nAverage: 78.00\nHighest: 100\nResult: FAIL',
    marks: 15,
    isEdgeCase: true,
    explanation: 'First subject fails at boundary (34 < 35) despite 100 in other two.',
  },
  {
    stdin: '40 60 80',
    expectedOutput: 'Total: 180\nAverage: 60.00\nHighest: 80\nResult: PASS',
    marks: 10,
    isEdgeCase: false,
    explanation: 'Mixed ascending subject scores.',
  },
  {
    stdin: '35 34 35',
    expectedOutput: 'Total: 104\nAverage: 34.67\nHighest: 35\nResult: FAIL',
    marks: 15,
    isEdgeCase: true,
    explanation: 'Precision rounding (104 / 3 = 34.67) and middle subject fail boundary.',
  },
];

export const OFFICIAL_ROUND2_VERIFICATION_TESTS = [
  {
    bugKey: 'BUG_TOTAL_CALCULATION',
    stdin: '80 70 90',
    expectedOutput: 'Total: 240\nAverage: 80.00\nHighest: 90\nResult: PASS',
  },
  {
    bugKey: 'BUG_AVERAGE_CALCULATION',
    stdin: '35 34 35',
    expectedOutput: 'Total: 104\nAverage: 34.67\nHighest: 35\nResult: FAIL',
  },
  {
    bugKey: 'BUG_HIGHEST_MARK',
    stdin: '40 60 80',
    expectedOutput: 'Total: 180\nAverage: 60.00\nHighest: 80\nResult: PASS',
  },
  {
    bugKey: 'BUG_PASS_FAIL_CONDITION',
    stdin: '90 30 90',
    expectedOutput: 'Total: 210\nAverage: 70.00\nHighest: 90\nResult: FAIL',
  },
];
