// ============================================
// CoastFireSection — Lifted to module scope
// ============================================
function CoastFireSection({ accounts, personalInfo, retirementProjection, openInfoCard, toggleInfoCard, toggleVisibility, projections, badge }) {
  const [showTestScenarios, setShowTestScenarios] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [showMathBreakdown, setShowMathBreakdown] = useState(false);
  
  // Test scenarios from published sources
  const testScenarios = [
    { 
      id: 1, 
      name: 'SmartAsset Example', 
      source: 'smartasset.com',
      annualSpending: 100000, 
      yearsToRetirement: 35, 
      returnRate: 0.06,
      expectedCoastNumber: 334000,
      description: 'Target $100k/year spending, 35 years out, 6% return'
    },
    { 
      id: 2, 
      name: 'TheFireCalculator Example', 
      source: 'thefirecalculator.com',
      annualSpending: 50000, 
      yearsToRetirement: 25, 
      returnRate: 0.07,
      expectedCoastNumber: 230000,
      description: 'Target $50k/year spending, 25 years out, 7% return'
    },
    { 
      id: 3, 
      name: 'Kubera Example', 
      source: 'kubera.com',
      annualSpending: 40000, 
      yearsToRetirement: 25, 
      returnRate: 0.07,
      expectedCoastNumber: 184249,
      description: 'Target $40k/year spending (=$1M FIRE), 25 years out, 7% return'
    },
    { 
      id: 4, 
      name: 'FinancialAha Example', 
      source: 'financialaha.com',
      annualSpending: 60000, 
      yearsToRetirement: 30, 
      returnRate: 0.07,
      expectedCoastNumber: 197105,
      description: 'Target $60k/year spending (=$1.5M FIRE), 30 years out, 7% return'
    },
    { 
      id: 5, 
      name: 'Marriage Kids Money Example', 
      source: 'marriagekidsandmoney.com',
      currentPortfolio: 500000, 
      yearsToRetirement: 25, 
      returnRate: 0.07,
      expectedFutureValue: 2714076,
      isGrowthTest: true,
      description: '$500k today grows to $2.7M in 25 years at 7%'
    },
  ];
  
  // Calculate for a test scenario
  const calculateScenario = (scenario) => {
    if (scenario.isGrowthTest) {
      // Future value test
      const calculated = scenario.currentPortfolio * Math.pow(1 + scenario.returnRate, scenario.yearsToRetirement);
      return {
        calculated: Math.round(calculated),
        expected: scenario.expectedFutureValue,
        difference: Math.round(calculated - scenario.expectedFutureValue),
        percentDiff: ((calculated - scenario.expectedFutureValue) / scenario.expectedFutureValue * 100).toFixed(2)
      };
    } else {
      // Coast FIRE number test
      const fireNumber = scenario.annualSpending / 0.04; // 25x rule
      const coastNumber = fireNumber / Math.pow(1 + scenario.returnRate, scenario.yearsToRetirement);
      return {
        fireNumber: Math.round(fireNumber),
        calculated: Math.round(coastNumber),
        expected: scenario.expectedCoastNumber,
        difference: Math.round(coastNumber - scenario.expectedCoastNumber),
        percentDiff: ((coastNumber - scenario.expectedCoastNumber) / scenario.expectedCoastNumber * 100).toFixed(2)
      };
    }
  };
  
  // Use actual data or selected test scenario
  const useTestData = selectedScenario !== null;
  const scenario = useTestData ? testScenarios.find(s => s.id === selectedScenario) : null;
  
  // Calculate Coast FIRE values — use engine data for current portfolio and growth rate
  const currentYearData = projections[0]; // Current year from unified engine
  const currentPortfolio = useTestData && scenario?.currentPortfolio 
    ? scenario.currentPortfolio 
    : (currentYearData?.totalPortfolio || 0);
  
  const yearsToRetirement = useTestData && scenario?.yearsToRetirement
    ? scenario.yearsToRetirement
    : Math.max(0, personalInfo.myRetirementAge - personalInfo.myAge);
  
  // EVERYTHING in this component is in TODAY's dollars, discounted at the REAL
  // return. The engine's guaranteed-income figure is nominal at the retirement
  // year, so it has to be deflated before it can be netted against a today's-
  // dollar spending target. Previously it was subtracted as-is, which understated
  // the portfolio's job, and the resulting real target was then discounted at the
  // NOMINAL return — three mixed bases compounding in the same direction.
  const inflation = personalInfo.inflationRate ?? 0.03;
  const guaranteedAtRetirement = useTestData ? 0 : (retirementProjection?.totalGuaranteedIncome || 0);
  const guaranteedIncomeToday = useTestData ? 0
    : deflateToToday(guaranteedAtRetirement, personalInfo.myAge, personalInfo.myRetirementAge, inflation);

  const spendingToday = useTestData && scenario?.annualSpending
    ? scenario.annualSpending
    : personalInfo.desiredRetirementIncome;

  const weightedCAGR = useTestData && scenario?.returnRate
    ? scenario.returnRate
    : (currentYearData?.weightedCAGR || 0.07);

  // Test scenarios are stated as self-contained real figures, so they carry no
  // inflation of their own; use a zero rate for them to keep the math identical
  // to what those fixtures expect.
  const coastInflation = useTestData ? 0 : inflation;
  const coast4 = coastFire({ spendingToday, guaranteedIncomeToday, yearsToRetirement,
    nominalReturn: weightedCAGR, inflationRate: coastInflation, withdrawalRate: 0.04 });
  const coast3 = coastFire({ spendingToday, guaranteedIncomeToday, yearsToRetirement,
    nominalReturn: weightedCAGR, inflationRate: coastInflation, withdrawalRate: 0.03 });

  const spendingFromPortfolio = coast4.portfolioSpendingToday;
  const targetPortfolioAtRetirement = coast4.targetToday;
  const targetPortfolioAt3Pct = coast3.targetToday;
  // Real growth, matching the discount used inside coastFire.
  const growthFactor = Math.pow(1 + realReturn(weightedCAGR, coastInflation), yearsToRetirement);
  const coastFireNumber4Pct = coast4.coastNumberToday;
  const coastFireNumber3Pct = coast3.coastNumberToday;
  const coastProgress4Pct = coastFireNumber4Pct > 0 ? (currentPortfolio / coastFireNumber4Pct) * 100 : 0;
  const coastProgress3Pct = coastFireNumber3Pct > 0 ? (currentPortfolio / coastFireNumber3Pct) * 100 : 0;
  const reachedCoast4Pct = currentPortfolio >= coastFireNumber4Pct;
  // Real growth of today's balance, so this stays comparable to targetToday.
  const projectedCoasting = currentPortfolio * growthFactor;
  // The engine's at-retirement balance is NOMINAL; deflate it to sit alongside
  // the real figures above rather than towering over them by the inflation factor.
  const projectedWithContributions = retirementProjection?.totalPortfolio
    ? deflateToToday(retirementProjection.totalPortfolio, personalInfo.myAge, personalInfo.myRetirementAge, coastInflation)
    : projectedCoasting;
  const coastSurplus = projectedCoasting - targetPortfolioAtRetirement;

  let earlyRetirementAge = null;
  if (reachedCoast4Pct && !useTestData) {
    // Target is in today's dollars, so the growth that closes the gap is real too.
    const yearsNeeded = Math.log(targetPortfolioAtRetirement / currentPortfolio) / Math.log(1 + realReturn(weightedCAGR, coastInflation));
    earlyRetirementAge = Math.ceil(personalInfo.myAge + yearsNeeded);
  }
  
  return (
    <div className={cardStyle}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-slate-100">Coast FIRE Progress</h3>{badge}
          <InfoCard
            title="Coast FIRE"
            isOpen={openInfoCard === 'coastFire'}
            onToggle={() => toggleInfoCard('coastFire')}
            sections={[
              {
                heading: 'What Is Coast FIRE?',
                body: 'Coast FIRE (Financial Independence, Retire Early) is the point where your current retirement savings, if left completely alone with no further contributions, will grow enough through market returns to fully fund your retirement by your target retirement age.'
              },
              {
                heading: 'What The Numbers Mean',
                items: [
                  { icon: '🎯', label: 'Coast FIRE Number (4%)', desc: 'The portfolio balance you need TODAY so that compound growth alone gets you to a retirement portfolio that supports your spending at a 4% withdrawal rate. Calculated as: (Annual spending need ÷ 0.04) ÷ (1 + growth rate)^years to retirement.' },
                  { icon: '🛡️', label: 'Conservative (3%)', desc: 'Same calculation but using a safer 3% withdrawal rate — requires a larger number but provides more margin.' },
                  { icon: '📊', label: 'Progress Percentage', desc: 'How close you are to your Coast FIRE number. At 100%+, you could theoretically stop all retirement contributions and still be on track.' },
                  { icon: '🏖️', label: 'Early Retirement Age', desc: 'If you\'ve reached Coast FIRE, this shows the earliest age your current portfolio could grow to meet your target — without any additional contributions.' }
                ]
              },
              {
                heading: 'What Reaching Coast FIRE Means',
                body: 'Reaching Coast FIRE doesn\'t mean you should stop saving — it means you have options. You could take a lower-paying but more fulfilling job, reduce hours, or simply have peace of mind that your retirement is funded even if life throws curveballs.',
                tip: 'Coast FIRE assumes your portfolio earns your weighted average return every year without interruption. Real markets are volatile — continuing to contribute beyond Coast FIRE provides a buffer against bad sequence of returns. Think of it as a milestone, not a finish line.'
              },
              {
                heading: 'The Math',
                items: [
                  { icon: '1️⃣', label: 'Step 1', desc: 'Calculate retirement spending need from portfolio (desired income minus guaranteed income like SS/pension).' },
                  { icon: '2️⃣', label: 'Step 2', desc: 'Apply the 4% rule in reverse: spending ÷ 0.04 = required portfolio at retirement (the "25x rule").' },
                  { icon: '3️⃣', label: 'Step 3', desc: 'Discount that future amount back to today: required portfolio ÷ (1 + growth rate)^years = Coast FIRE number.' },
                  { icon: '4️⃣', label: 'Step 4', desc: 'Compare your current portfolio to the Coast FIRE number to get your progress percentage.' }
                ]
              }
            ]}
          />
          {toggleVisibility && (
          <button
            onClick={() => toggleVisibility('coastFire')}
            className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded hover:bg-slate-700/50 transition-colors"
            title="Hide this section"
          >
            Hide
          </button>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowMathBreakdown(!showMathBreakdown)}
            className={`px-3 py-1 text-xs rounded ${showMathBreakdown ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          >
            {showMathBreakdown ? '✓ Math Breakdown' : 'Show Math'}
          </button>
          <button
            onClick={() => setShowTestScenarios(!showTestScenarios)}
            className={`px-3 py-1 text-xs rounded ${showTestScenarios ? 'bg-amber-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          >
            {showTestScenarios ? '✓ Test Scenarios' : 'Validate Calculator'}
          </button>
        </div>
      </div>
      
      <p className="text-sm text-slate-400 mb-4">
        Coast FIRE is when your current portfolio, with no additional contributions, will grow to support your retirement spending goals.
      </p>
      
      {/* Test Scenarios Panel */}
      {showTestScenarios && (
        <div className="mb-4 p-3 bg-slate-800/80 rounded-lg border border-amber-500/30">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-amber-400">🧪 Test Scenarios from Published Sources</h4>
            {selectedScenario && (
              <button 
                onClick={() => setSelectedScenario(null)}
                className="px-2 py-1 text-xs bg-slate-700 text-slate-300 rounded hover:bg-slate-600"
              >
                ← Back to My Data
              </button>
            )}
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-1.5 px-2 text-slate-400">Scenario</th>
                  <th className="text-right py-1.5 px-2 text-slate-400">Expected</th>
                  <th className="text-right py-1.5 px-2 text-slate-400">Calculated</th>
                  <th className="text-right py-1.5 px-2 text-slate-400">Diff</th>
                  <th className="text-center py-1.5 px-2 text-slate-400">Status</th>
                  <th className="text-center py-1.5 px-2 text-slate-400">Action</th>
                </tr>
              </thead>
              <tbody>
                {testScenarios.map(s => {
                  const result = calculateScenario(s);
                  const isMatch = Math.abs(parseFloat(result.percentDiff)) < 1;
                  return (
                    <tr key={s.id} className={`border-b border-slate-700/50 ${selectedScenario === s.id ? 'bg-amber-500/20' : ''}`}>
                      <td className="py-1.5 px-2">
                        <div className="text-slate-300">{s.name}</div>
                        <div className="text-slate-500 text-[10px]">{s.description}</div>
                      </td>
                      <td className="py-1.5 px-2 text-right text-slate-300 font-mono">
                        {formatCurrency(s.isGrowthTest ? s.expectedFutureValue : s.expectedCoastNumber)}
                      </td>
                      <td className="py-1.5 px-2 text-right text-purple-400 font-mono">
                        {formatCurrency(result.calculated)}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono">
                        <span className={isMatch ? 'text-emerald-400' : 'text-amber-400'}>
                          {result.percentDiff}%
                        </span>
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        {isMatch 
                          ? <span className="text-emerald-400">✓ Match</span>
                          : <span className="text-amber-400">~ Close</span>
                        }
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        <button
                          onClick={() => setSelectedScenario(selectedScenario === s.id ? null : s.id)}
                          className={`px-2 py-0.5 text-[10px] rounded ${selectedScenario === s.id ? 'bg-amber-600 text-white' : 'bg-slate-600 text-slate-300 hover:bg-slate-500'}`}
                        >
                          {selectedScenario === s.id ? 'Active' : 'Load'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          {selectedScenario && scenario && (
            <div className="mt-3 p-2 bg-amber-500/10 rounded text-xs text-amber-300">
              <strong>Testing:</strong> {scenario.name} — {scenario.description}
              <br/>
              <span className="text-slate-400">Source: {scenario.source}</span>
            </div>
          )}
        </div>
      )}
      
      {/* Math Breakdown Panel */}
      {showMathBreakdown && (
        <div className="mb-4 p-3 bg-slate-800/80 rounded-lg border border-purple-500/30">
          <h4 className="text-sm font-semibold text-purple-400 mb-3">📐 Calculation Breakdown</h4>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
            <div>
              <div className="text-slate-400 mb-2 font-medium">Step 1: Calculate FIRE Number (25x Rule)</div>
              <div className="font-mono bg-slate-900/50 p-2 rounded text-slate-300">
                <div>Annual Spending from Portfolio = {formatCurrency(spendingFromPortfolio)}</div>
                <div className="text-slate-500">FIRE Number = Spending ÷ 0.04</div>
                <div className="text-purple-400">FIRE Number = {formatCurrency(spendingFromPortfolio)} ÷ 0.04 = {formatCurrency(targetPortfolioAtRetirement)}</div>
              </div>
            </div>
            
            <div>
              <div className="text-slate-400 mb-2 font-medium">Step 2: Calculate Growth Factor</div>
              <div className="font-mono bg-slate-900/50 p-2 rounded text-slate-300">
                <div>Return Rate = {(weightedCAGR * 100).toFixed(1)}%</div>
                <div>Years = {yearsToRetirement}</div>
                <div className="text-slate-500">Growth Factor = (1 + r)^n</div>
                <div className="text-purple-400">= (1 + {weightedCAGR.toFixed(3)})^{yearsToRetirement} = {growthFactor.toFixed(3)}</div>
              </div>
            </div>
            
            <div>
              <div className="text-slate-400 mb-2 font-medium">Step 3: Calculate Coast FIRE Number</div>
              <div className="font-mono bg-slate-900/50 p-2 rounded text-slate-300">
                <div className="text-slate-500">Coast FIRE = FIRE Number ÷ Growth Factor</div>
                <div className="text-purple-400">= {formatCurrency(targetPortfolioAtRetirement)} ÷ {growthFactor.toFixed(3)}</div>
                <div className="text-emerald-400 font-bold">= {formatCurrency(coastFireNumber4Pct)}</div>
              </div>
            </div>
            
            <div>
              <div className="text-slate-400 mb-2 font-medium">Step 4: Project Future Value (Coasting)</div>
              <div className="font-mono bg-slate-900/50 p-2 rounded text-slate-300">
                <div className="text-slate-500">FV = Current Portfolio × Growth Factor</div>
                <div className="text-purple-400">= {formatCurrency(currentPortfolio)} × {growthFactor.toFixed(3)}</div>
                <div className="text-emerald-400 font-bold">= {formatCurrency(projectedCoasting)}</div>
              </div>
            </div>
          </div>
          
          <div className="mt-3 p-2 bg-purple-500/10 rounded text-xs">
            <strong className="text-purple-400">Formula Summary:</strong>
            <div className="text-slate-300 mt-1">
              Coast FIRE Number = (Annual Spending ÷ 0.04) ÷ (1 + return)^years
            </div>
            <div className="text-slate-300">
              = ({formatCurrency(spendingFromPortfolio)} ÷ 0.04) ÷ (1 + {(weightedCAGR * 100).toFixed(1)}%)^{yearsToRetirement}
            </div>
            <div className="text-emerald-400">
              = {formatCurrency(targetPortfolioAtRetirement)} ÷ {growthFactor.toFixed(3)} = <strong>{formatCurrency(coastFireNumber4Pct)}</strong>
              <span className="block text-xs text-slate-500 mt-1">Every figure here is in today&rsquo;s dollars, so the growth factor is the REAL return ({(realReturn(weightedCAGR, coastInflation)*100).toFixed(2)}% = {(weightedCAGR*100).toFixed(1)}% growth net of {(coastInflation*100).toFixed(1)}% inflation), not the nominal one.</span>
            </div>
          </div>
        </div>
      )}
      
      {/* Using Test Data Indicator */}
      {useTestData && (
        <div className="mb-4 p-2 bg-amber-500/20 rounded-lg border border-amber-500/50 text-xs text-amber-300">
          ⚠️ Showing test scenario data, not your actual portfolio. Click "Back to My Data" to return.
        </div>
      )}
      
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className={`border rounded-lg px-4 py-3 ${reachedCoast4Pct ? 'bg-emerald-500/20 border-emerald-500/50' : 'bg-slate-800/60 border-slate-700/50'}`}>
          <div className="text-slate-400 text-xs mb-0.5">Coast FIRE Number (4%)</div>
          <div className={`text-xl font-bold ${reachedCoast4Pct ? 'text-emerald-400' : 'text-slate-300'}`}>
            {formatCurrency(coastFireNumber4Pct)}
          </div>
          <div className="text-xs text-slate-500">Portfolio needed today</div>
        </div>
        <div className="border rounded-lg px-4 py-3 bg-purple-500/20 border-purple-500/50">
          <div className="text-slate-400 text-xs mb-0.5">{useTestData ? 'Test Portfolio' : 'Your Current Portfolio'}</div>
          <div className="text-xl font-bold text-purple-400">{formatCurrency(currentPortfolio)}</div>
          <div className="text-xs text-slate-500">
            {reachedCoast4Pct 
              ? <span className="text-emerald-400">✓ Coast FIRE reached!</span>
              : <span>{formatCurrency(coastFireNumber4Pct - currentPortfolio)} to go</span>
            }
          </div>
        </div>
        <div className={`border rounded-lg px-4 py-3 ${coastProgress4Pct >= 100 ? 'bg-emerald-500/20 border-emerald-500/50' : coastProgress4Pct >= 75 ? 'bg-amber-500/20 border-amber-500/50' : 'bg-slate-800/60 border-slate-700/50'}`}>
          <div className="text-slate-400 text-xs mb-0.5">Progress to Coast FIRE</div>
          <div className={`text-xl font-bold ${coastProgress4Pct >= 100 ? 'text-emerald-400' : coastProgress4Pct >= 75 ? 'text-amber-400' : 'text-slate-300'}`}>
            {Math.min(coastProgress4Pct, 100).toFixed(0)}%
          </div>
          <div className="text-xs text-slate-500">
            {coastProgress4Pct > 100 ? `${(coastProgress4Pct - 100).toFixed(0)}% buffer` : 'of 4% rule target'}
          </div>
        </div>
        <div className="border rounded-lg px-4 py-3 bg-sky-500/20 border-sky-500/50">
          <div className="text-slate-400 text-xs mb-0.5">Target at Retirement</div>
          <div className="text-xl font-bold text-sky-400">{formatCurrency(targetPortfolioAtRetirement)}</div>
          <div className="text-xs text-slate-500">To support {formatCurrency(spendingFromPortfolio)}/yr &middot; today&rsquo;s $</div>
        </div>
      </div>
      
      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <span>Progress to Coast FIRE (4% rule)</span>
          <span>{coastProgress4Pct.toFixed(1)}%</span>
        </div>
        <div className="h-4 bg-slate-700 rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all ${coastProgress4Pct >= 100 ? 'bg-emerald-500' : coastProgress4Pct >= 75 ? 'bg-amber-500' : 'bg-purple-500'}`}
            style={{ width: `${Math.min(coastProgress4Pct, 100)}%` }}
          />
        </div>
        {coastProgress4Pct < 100 && (
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>{formatCurrency(currentPortfolio)}</span>
            <span>{formatCurrency(coastFireNumber4Pct)}</span>
          </div>
        )}
      </div>
      
      {/* Comparison: With vs Without Contributions */}
      {!useTestData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <div className="p-3 bg-slate-800/50 rounded-lg">
            <div className="text-sm font-medium text-slate-300 mb-2">If You Coast Now (No More Contributions)</div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Portfolio at {personalInfo.myRetirementAge}:</span>
              <span className={coastSurplus >= 0 ? 'text-emerald-400' : 'text-red-400'}>{formatCurrency(projectedCoasting)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">vs Target needed:</span>
              <span className={coastSurplus >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                {coastSurplus >= 0 ? '+' : ''}{formatCurrency(coastSurplus)}
              </span>
            </div>
          </div>
          <div className="p-3 bg-slate-800/50 rounded-lg">
            <div className="text-sm font-medium text-slate-300 mb-2">With Continued Contributions</div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Portfolio at {personalInfo.myRetirementAge}:</span>
              <span className="text-emerald-400">{formatCurrency(projectedWithContributions)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Extra vs coasting:</span>
              <span className="text-emerald-400">+{formatCurrency(projectedWithContributions - projectedCoasting)}</span>
            </div>
          </div>
        </div>
      )}
      
      {/* Status Message */}
      {!useTestData && (
        <div className={`p-3 rounded-lg ${reachedCoast4Pct ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-amber-500/10 border border-amber-500/30'}`}>
          {reachedCoast4Pct ? (
            <p className="text-sm text-emerald-300">
              <strong>🎉 You've reached Coast FIRE!</strong> Your current portfolio of {formatCurrency(currentPortfolio)}, 
              even with no additional contributions, is projected to grow to {formatCurrency(projectedCoasting)} by age {personalInfo.myRetirementAge}. 
              This exceeds your target of {formatCurrency(targetPortfolioAtRetirement)} needed to support {formatCurrency(spendingFromPortfolio)}/year in retirement.
              {earlyRetirementAge && earlyRetirementAge < personalInfo.myRetirementAge && (
                <span className="block mt-2">
                  💡 You could potentially retire as early as age <strong>{earlyRetirementAge}</strong> if you continued contributing.
                </span>
              )}
            </p>
          ) : (
            <p className="text-sm text-amber-300">
              <strong>📈 Keep going!</strong> You're {coastProgress4Pct.toFixed(0)}% of the way to Coast FIRE. 
              You need {formatCurrency(coastFireNumber4Pct - currentPortfolio)} more to reach the point where you could stop contributing 
              and still hit your retirement goals.
            </p>
          )}
        </div>
      )}
      
      <p className="text-xs text-slate-500 mt-3">
        Assumes {(weightedCAGR * 100).toFixed(1)}% average annual return{!useTestData && ' (weighted by your account balances)'} and {yearsToRetirement} years until retirement.
        Conservative Coast FIRE (3% rule) requires {formatCurrency(coastFireNumber3Pct)} — you're at {coastProgress3Pct.toFixed(0)}% of that target.
      </p>
    </div>
  );
}

// ============================================
// LifestyleVsLegacy — Lifted to module scope
// ============================================
function LifestyleVsLegacy({ projections, personalInfo, accounts, incomeStreams, assets, oneTimeEvents, recurringExpenses, retirementAge, openInfoCard, toggleInfoCard, computeProjections, toggleVisibility, badge }) {
  const strategySets = strategyLeadsSpending(personalInfo);
  const lastRow = projections && projections.length ? projections[projections.length - 1] : null;
  const legacyAgeShown = Math.min(personalInfo.legacyAge || 95, lastRow ? lastRow.myAge : Infinity);
  const scenarios = useMemo(() => {
    // Every row would be the same plan: the strategy, not the target, sets spending.
    if (strategySets) return [];
    const baseDesired = personalInfo.desiredRetirementIncome;
    const adjustments = [-30, -20, -10, 0, 10, 20, 30, 50];
    const legacyAge = personalInfo.legacyAge || 95;
    
    return adjustments.map(adj => {
      const adjustedDesired = baseDesired * (1 + adj / 100);
      
      // Use the unified projection engine with modified spending target
      const modifiedPI = { ...personalInfo, desiredRetirementIncome: adjustedDesired };
      const proj = computeProjections(modifiedPI, accounts, incomeStreams, assets, oneTimeEvents, recurringExpenses);
      
      // The projection stops at the last death, which can come before the
      // legacy age; what is left then is the legacy.
      const legacyYear = proj.find(p => p.myAge === legacyAge) || proj[proj.length - 1];
      const legacyAtTarget = legacyYear ? legacyYear.totalPortfolio : 0;
      const runsOutAge = proj.find(p => p.myAge >= retirementAge && p.totalPortfolio <= 0)?.myAge || null;
      
      return { adjustment: adj, spending: adjustedDesired, legacy: Math.round(legacyAtTarget), runsOut: runsOutAge };
    });
  }, [strategySets, personalInfo, accounts, incomeStreams, assets, oneTimeEvents, recurringExpenses, retirementAge, computeProjections]);
  
  return (
    <div className={cardStyle}>
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-lg font-semibold text-slate-100">Lifestyle vs Legacy Tradeoff</h3>{badge}
        <InfoCard
          title="Lifestyle vs Legacy Tradeoff"
          isOpen={openInfoCard === 'lifestyleLegacy'}
          onToggle={() => toggleInfoCard('lifestyleLegacy')}
          sections={[
            {
              heading: 'What This Shows',
              body: 'This table explores a fundamental retirement tension: spending more means a better lifestyle but a smaller inheritance, while spending less preserves wealth for heirs but may mean unnecessary frugality. It runs your complete financial plan at 8 different spending levels to show the tradeoff.'
            },
            {
              heading: 'Reading The Table',
              items: [
                { icon: '📋', label: 'Scenario', desc: 'Each row adjusts your base desired income by the shown percentage. "Your Plan (Base)" at 0% is your current settings. Negative percentages mean spending less; positive means spending more.' },
                { icon: '💜', label: 'Annual Spend', desc: 'The actual dollar amount of desired retirement income for that scenario (in today\'s dollars — inflation is applied internally during the simulation).' },
                { icon: '💚', label: `Legacy at ${personalInfo.legacyAge || 95}`, desc: `What's left in your accounts at your legacy age under this spending level. This is the money available for heirs, charitable giving, or as a safety buffer.` },
                { icon: '✅', label: 'Status', desc: `"Sustainable" (green ✓) means money lasts through age ${personalInfo.legacyAge || 95}. "Runs out at [age]" (red) means the portfolio is depleted before age ${personalInfo.legacyAge || 95} at that spending level.` }
              ]
            },
            {
              heading: 'How to Use This',
              body: 'Find the row where your plan sits (highlighted in gold). Look at your legacy amount — is it larger than you need? You might be able to spend more and enjoy retirement. Is status showing "Runs out"? You need to reduce spending or boost savings. The table lets you see exactly where the sustainability boundary lies.',
              tip: 'Many people discover they\'re being unnecessarily conservative — leaving hundreds of thousands behind when they could have enjoyed a richer retirement. Others find they\'re right on the edge. This table helps you make that tradeoff intentionally rather than by accident.'
            },
            {
              heading: 'What\'s Behind The Numbers',
              body: `Each row runs a full year-by-year projection from today through age ${personalInfo.legacyAge || 95} — including contributions during working years, tax-aware withdrawals, RMDs, Social Security, pensions, and account growth. It uses the same engine as your main projection, just with adjusted spending targets.`
            }
          ]}
        />
        {toggleVisibility && (
        <button
          onClick={() => toggleVisibility('lifestyleLegacy')}
          className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded hover:bg-slate-700/50 transition-colors"
          title="Hide this section"
        >
          Hide
        </button>
        )}
      </div>
      {strategySets ? (
        <StrategySetsSpendingNote pi={personalInfo}>
          The same tradeoff, strategy by strategy (what each lets you spend against what it leaves), is the
          comparison on Will it last?
        </StrategySetsSpendingNote>
      ) : (<>
      <p className="text-sm text-slate-400 mb-4">
        See how different spending levels affect your legacy. Your current plan is highlighted.
      </p>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left py-2 px-2 text-slate-400">Scenario</th>
              <th className="text-right py-2 px-2 text-slate-400">Annual Spend</th>
              <th className="text-right py-2 px-2 text-slate-400">Legacy at {legacyAgeShown}</th>
              <th className="text-center py-2 px-2 text-slate-400">Status</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map(s => (
              <tr key={s.adjustment} className={`border-b border-slate-700/50 ${s.adjustment === 0 ? 'bg-amber-500/20' : ''}`}>
                <td className="py-1.5 px-2 text-slate-300">{s.adjustment === 0 ? 'Your Plan (Base)' : `${s.adjustment > 0 ? '+' : ''}${s.adjustment}%`}</td>
                <td className="py-1.5 px-2 text-right text-purple-400">{formatCurrency(s.spending)}</td>
                <td className="py-1.5 px-2 text-right text-emerald-400">{formatCurrency(s.legacy)}</td>
                <td className="py-1.5 px-2 text-center">
                  {s.runsOut ? <span className="text-red-400 text-xs">Runs out at {s.runsOut}</span> : <span className="text-emerald-400 text-xs">✓ Sustainable</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>)}
    </div>
  );
}

