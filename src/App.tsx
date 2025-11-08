// App.tsx
import React, { useMemo, useState, useDeferredValue } from "react";

/**
 * Interactive Health Insurance Plan Calculator — Full UI with Pharmacy Legend
 * --------------------------------------------------------------------------
 * - Restores the full comparison + calculator UI.
 * - Renders pharmacy tiers with proper newlines via template literals and
 *   `whitespace-pre-line` styling.
 * - Places legend ("AD = After Deductible ...") directly under the Pharmacy row.
 * - Keeps coverage-correct thresholds and negative outflow costs.
 */

// -----------------------------------------------
// Data (immutable)
// -----------------------------------------------
const planData = {
  traditional: {
    name: "SelectHealth Traditional",
    costs: {
      employee: { monthly: 176, pay: 81.23 },
      spouse: { monthly: 401, pay: 185.08 },
      children: { monthly: 330, pay: 152.31 },
      family: { monthly: 599, pay: 276.46 },
    },
    hsaMatch: { employee: 0, spouse: 0, children: 0, family: 0 },
    details: {
      deductible: { person: 750, family: 2250 },
      oopMax: { person: 3500, family: 7000 },
      pharmacy: `Tier 1: $15
Tier 2: $30
Tier 3: $60
Tier 4: 30%
No deductible needs to be met for this benefit`,
    },
  },
  hdhpA: {
    name: "SelectHealth HDHP Plan A",
    costs: {
      employee: { monthly: 88, pay: 40.62 },
      spouse: { monthly: 198, pay: 91.38 },
      children: { monthly: 148, pay: 68.31 },
      family: { monthly: 297, pay: 137.08 },
    },
    hsaMatch: { employee: 600, spouse: 1200, children: 1200, family: 1200 },
    details: {
      deductible: { employeeOnly: 1700, twoPlus: 3400 },
      oopMax: { person: 3500, family: 7000 },
      pharmacy: `Tier 1: $10 AD
Tier 2: $25 AD
Tier 3: $45 AD
Tier 4: 30% AD
The deductible must be met first!`,
    },
  },
  hdhpB: {
    name: "SelectHealth HDHP Plan B",
    costs: {
      employee: { monthly: 25, pay: 11.54 },
      spouse: { monthly: 55, pay: 25.38 },
      children: { monthly: 52, pay: 23.85 },
      family: { monthly: 82, pay: 37.85 },
    },
    hsaMatch: { employee: 600, spouse: 1200, children: 1200, family: 1200 },
    details: {
      deductible: { employeeOnly: 5000, twoPlus: 10000 },
      oopMax: { person: 6000, family: 12000 },
      pharmacy: `Tier 1: $10 AD
Tier 2: $25 AD
Tier 3: $45 AD
Tier 4: 30% AD
The deductible must be met first!`,
    },
  },
} as const;

type Coverage = keyof typeof planData.traditional.costs;
type DisplayMode = "monthly" | "pay";

type Plan = (typeof planData)[keyof typeof planData];
const PLAN_ORDER: Plan[] = [planData.traditional, planData.hdhpA, planData.hdhpB];

// -----------------------------------------------
// Helpers
// -----------------------------------------------
const currency = (n: number) =>
  n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });

const coverageMaxHSA = (coverage: Coverage) =>
  coverage === "employee" ? 4400 : 8750;

const premiumFor = (plan: Plan, coverage: Coverage, mode: DisplayMode) =>
  mode === "monthly" ? plan.costs[coverage].monthly : plan.costs[coverage].pay;

const employerMatchFor = (plan: Plan, coverage: Coverage) =>
  plan.hsaMatch[coverage] ?? 0;

function thresholdsFor(plan: Plan, coverage: Coverage) {
  const d: any = plan.details.deductible;
  const o: any = plan.details.oopMax;
  // HDHP plans: employeeOnly/twoPlus; Traditional: person/family
  const deductible =
    d.employeeOnly !== undefined
      ? coverage === "employee"
        ? d.employeeOnly
        : d.twoPlus
      : coverage === "employee"
      ? d.person
      : d.family;

  const oopMax = coverage === "employee" ? o.person : o.family; // all plans have person/family
  return { deductible, oopMax };
}

const deductibleText = (plan: Plan) => {
  const d: any = plan.details.deductible;
  return d.employeeOnly !== undefined
    ? `Employee Only ${currency(d.employeeOnly)}
2+ Enrollees ${currency(d.twoPlus)}`
    : `Person ${currency(d.person)}
Family ${currency(d.family)}`;
};

const oopText = (plan: Plan) => {
  const o: any = plan.details.oopMax;
  return `Person ${currency(o.person)}
Family ${currency(o.family)}`;
};

const totalContributionIncludingMatch = (matchCap: number, employee: number) =>
  matchCap <= 0 ? employee : employee >= matchCap ? employee + matchCap : employee * 2;

// -----------------------------------------------
// Main component
// -----------------------------------------------
function HealthPlanComparison() {
  const [coverage, setCoverage] = useState<Coverage>("family");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("pay");
  const [expectedSpend, setExpectedSpend] = useState(0);
  const [employeeContribution, setEmployeeContribution] = useState(0);

  const dExpectedSpend = useDeferredValue(expectedSpend);
  const dEmployeeContribution = useDeferredValue(employeeContribution);

  const displayLabel = displayMode === "monthly" ? "Monthly" : "Per Pay Period";
  const hsaMaxByCoverage = useMemo(() => coverageMaxHSA(coverage), [coverage]);

  const maxMatchForCoverage = useMemo(
    () =>
      Math.max(
        planData.hdhpA.hsaMatch[coverage] || 0,
        planData.hdhpB.hsaMatch[coverage] || 0
      ),
    [coverage]
  );

  const totalInclMatchDisplay = useMemo(
    () =>
      currency(
        totalContributionIncludingMatch(maxMatchForCoverage, dEmployeeContribution)
      ),
    [maxMatchForCoverage, dEmployeeContribution]
  );

  const calcResults = useMemo(() => {
    const coinsuranceRate = 0.2; // 20%
    return PLAN_ORDER.map((plan) => {
      const { deductible, oopMax } = thresholdsFor(plan, coverage);

      // Annual premium (negative outflow)
      const annualEmployeePremiumCost = -(plan.costs[coverage].monthly * 12);

      // HSA benefit = min(employee contrib, employer match)
      const match = employerMatchFor(plan, coverage);
      const hsaBenefit = Math.min(dEmployeeContribution, match);

      // Pre-deductible: negative min(expected, deductible)
      const preDeductibleCost = -Math.min(dExpectedSpend, deductible);

      // Post-deductible: negative 20% coinsurance, capped at OOP - deductible
      let postRaw = 0;
      if (dExpectedSpend > deductible) {
        const coinsurancePortion = (dExpectedSpend - deductible) * coinsuranceRate;
        const capPortion = Math.max(oopMax - deductible, 0);
        postRaw = Math.min(coinsurancePortion, capPortion);
      }
      const postDeductibleCost = -postRaw;

      const totalSpending =
        annualEmployeePremiumCost +
        hsaBenefit +
        preDeductibleCost +
        postDeductibleCost;

      return {
        plan,
        annualEmployeePremiumCost,
        hsaBenefit,
        preDeductibleCost,
        postDeductibleCost,
        totalSpending,
      };
    });
  }, [coverage, dEmployeeContribution, dExpectedSpend]);

  const onSetContribution = (val: number) => {
    const n = Number.isFinite(val) ? val : 0;
    setEmployeeContribution(Math.max(0, Math.min(hsaMaxByCoverage, n)));
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Health Plan Comparison</h1>
            <p className="text-gray-600 mt-1">
              Compare your estimated payroll costs and key plan details.
            </p>
          </div>
        </header>

        {/* Inputs */}
        <section className="bg-white rounded-2xl shadow p-5 space-y-4">
          <h2 className="text-xl font-semibold mb-2">Select Options</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-700 mb-1 block">
                Coverage Type
              </label>
              <select
                className="border-2 rounded-xl px-4 py-2 text-lg w-full"
                value={coverage}
                onChange={(e) => setCoverage(e.target.value as Coverage)}
              >
                <option value="employee">Employee Only</option>
                <option value="spouse">Employee + Spouse</option>
                <option value="children">Employee + Child(ren)</option>
                <option value="family">Employee + Family</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-700 mb-1 block">
                Display Costs As
              </label>
              <select
                className="border-2 rounded-xl px-4 py-2 text-lg w-full"
                value={displayMode}
                onChange={(e) => setDisplayMode(e.target.value as DisplayMode)}
              >
                <option value="monthly">Monthly</option>
                <option value="pay">Per Pay Period</option>
              </select>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Expected Medical Expenses ($/year)
              </label>
              <input
                type="number"
                min={0}
                step={100}
                className="border-2 rounded-xl px-4 py-2 w-full"
                placeholder="Enter amount"
                value={expectedSpend}
                onChange={(e) => setExpectedSpend(Number(e.target.value))}
              />
              <p className="text-xs text-gray-600 mt-1 italic">
                Note that this is expenses before insurance coverage, not what
                you expect to pay after insurance coverage. The calculator will
                help to calculate what your expenses will be based on
                deductible amounts, coverage type, and out of pocket maximums.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Annual HSA Contribution ($)
              </label>
              <input
                type="number"
                min={0}
                max={hsaMaxByCoverage}
                step={50}
                className="border-2 rounded-xl px-4 py-2 w-full"
                placeholder={`Enter 0 – ${currency(hsaMaxByCoverage)}`}
                value={employeeContribution}
                onChange={(e) => onSetContribution(Number(e.target.value))}
              />
              <p className="text-xs text-gray-600 mt-1">
                Total Contribution Including Nu Skin Match:{" "}
                <span className="font-medium">{totalInclMatchDisplay}</span>
              </p>
              <p className="text-[11px] text-gray-500 mt-1">
                (You can enter $0. Maximums by coverage — Employee Only:
                $4,400; Employee + Spouse/Child(ren)/Family: $8,750)
              </p>
            </div>
          </div>
        </section>

        {/* Comparison Section */}
        <section className="bg-white rounded-2xl shadow p-5">
          <h2 className="text-xl font-semibold mb-6 text-center">
            Side-by-Side Comparison
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 mb-10">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-white text-left px-4 py-3 border-b-2 border-gray-200 w-56"></th>
                  {PLAN_ORDER.map((p) => (
                    <th
                      key={p.name}
                      className="px-4 py-3 text-left border-b-2 border-gray-200"
                    >
                      <div className="font-bold">{p.name}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="sticky left-0 bg-white px-4 py-3 text-gray-700 font-medium border-b">
                    Premium / {displayLabel}
                  </td>
                  {PLAN_ORDER.map((p) => (
                    <td
                      key={p.name + "-prem-display"}
                      className="px-4 py-4 border-b"
                    >
                      <div className="text-2xl font-semibold">
                        {currency(premiumFor(p, coverage, displayMode))}
                      </div>
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="sticky left-0 bg-white px-4 py-3 text-gray-700 font-medium border-b">
                    Annual Employer HSA Match
                  </td>
                  {PLAN_ORDER.map((p) => {
                    const amt = employerMatchFor(p, coverage);
                    return (
                      <td key={p.name + "-hsa"} className="px-4 py-4 border-b">
                        {amt > 0 ? (
                          <>
                            <div className="text-green-700 font-semibold">
                              + {currency(amt)}
                            </div>
                            <div className="text-xs text-gray-500">
                              Nu Skin will match contributions up to this
                              amount.
                            </div>
                          </>
                        ) : (
                          <div className="text-gray-500 italic">None</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td className="sticky left-0 bg-white px-4 py-4 text-gray-700 font-medium border-b">
                    Deductible
                  </td>
                  {PLAN_ORDER.map((p) => (
                    <td
                      key={p.name + "-deduct"}
                      className="px-4 py-4 border-b whitespace-pre-line"
                    >
                      {deductibleText(p)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="sticky left-0 bg-white px-4 py-4 text-gray-700 font-medium border-b">
                    Out of Pocket Max
                  </td>
                  {PLAN_ORDER.map((p) => (
                    <td
                      key={p.name + "-oop"}
                      className="px-4 py-4 border-b whitespace-pre-line"
                    >
                      {oopText(p)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="sticky left-0 bg-white px-4 py-4 text-gray-700 font-medium align-top">
                    Pharmacy Benefit
                  </td>
                  {PLAN_ORDER.map((p) => (
                    <td
                      key={p.name + "-rx"}
                      className="px-4 py-4 whitespace-pre-line align-top"
                    >
                      {p.details.pharmacy}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="sticky left-0 bg-white px-4 py-2"></td>
                  <td
                    colSpan={PLAN_ORDER.length}
                    className="px-4 py-2 text-xs text-gray-600 italic"
                  >
                    AD = After Deductible (costs that apply once the deductible
                    is met)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Calculator Section */}
          <div className="mt-10">
            <h3 className="text-lg font-semibold mb-4 text-center">
              Calculated Costs
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-white text-left px-4 py-3 border-b-2 border-gray-200 w-56"></th>
                    {PLAN_ORDER.map((p) => (
                      <th
                        key={p.name + "-calc-head"}
                        className="px-4 py-3 text-left border-b-2 border-gray-200"
                      >
                        <div className="font-bold">{p.name}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="sticky left-0 bg-white px-4 py-3 text-gray-700 font-medium border-b">
                      Annual Employee Premium Cost
                    </td>
                    {calcResults.map(({ plan: p, annualEmployeePremiumCost }) => (
                      <td key={p.name + "-prem"} className="px-4 py-3 border-b">
                        {currency(annualEmployeePremiumCost)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="sticky left-0 bg-white px-4 py-3 text-gray-700 font-medium border-b">
                      HSA Benefit
                    </td>
                    {calcResults.map(({ plan: p, hsaBenefit }) => (
                      <td
                        key={p.name + "-hsaBenefit"}
                        className="px-4 py-3 border-b"
                      >
                        {currency(hsaBenefit)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="sticky left-0 bg-white px-4 py-3 text-gray-700 font-medium border-b">
                      Pre-Deductible Cost
                    </td>
                    {calcResults.map(({ plan: p, preDeductibleCost }) => (
                      <td key={p.name + "-pre"} className="px-4 py-3 border-b">
                        {currency(preDeductibleCost)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="sticky left-0 bg-white px-4 py-3 text-gray-700 font-medium border-b">
                      Post-Deductible Cost
                    </td>
                    {calcResults.map(({ plan: p, postDeductibleCost }) => (
                      <td key={p.name + "-post"} className="px-4 py-3 border-b">
                        {currency(postDeductibleCost)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="sticky left-0 bg-white px-4 py-3 text-gray-700 font-semibold border-t">
                      Total Spending
                    </td>
                    {calcResults.map(({ plan: p, totalSpending }) => (
                      <td key={p.name + "-total"} className="px-4 py-3 border-t font-semibold">
                        {currency(totalSpending)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <footer className="text-center text-xs text-gray-500 py-6">
          Full UI with legend under Pharmacy Benefit. Coverage-correct
          thresholds and negative outflow costs are preserved.
        </footer>
      </div>
    </div>
  );
}

// Default export expected by main.tsx
export default function App() {
  return <HealthPlanComparison />;
}
