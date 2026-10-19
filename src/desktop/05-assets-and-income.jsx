// ============================================
// AssetsTab — Lifted to module scope
// ============================================
function AssetsTab({ assetTypes, assets, setAssets, setEditingAsset, setShowAssetModal }) {
  const [assetInfoOpen, setAssetInfoOpen] = useState(false);
  const [localAssets, setLocalAssets] = useState(assets);
  const [dirtyAssets, setDirtyAssets] = useState(false);
  
  // Re-sync on any external content change (add/delete/edit/wholesale replace,
  // e.g. wizard relaunch or plan load). In-tab typing only mutates the local
  // mirror, not the parent prop, so this signature stays stable while editing.
  const assetsSig = JSON.stringify(assets);
  useEffect(() => {
    setLocalAssets(assets);
    setDirtyAssets(false);
  }, [assetsSig]);
  
  const updateAsset = (id, field, value) => {
    setLocalAssets(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a));
    setDirtyAssets(true);
  };
  const saveAssetChanges = () => {
    setAssets(localAssets);
    setDirtyAssets(false);
  };
  
  const totalAssetValue = assets.reduce((sum, a) => sum + a.value, 0);
  const totalDebt = assets.reduce((sum, a) => sum + (a.mortgage || 0), 0);
  const totalEquity = totalAssetValue - totalDebt;
  const maxNameWidth = Math.max(8, ...localAssets.map(a => a.name.length + 2));
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-semibold text-slate-100">Non-Liquid Assets</h3>
          <p className="text-sm text-slate-400">Real estate, business ownership, vehicles, and other assets for legacy planning. These don't affect cash flow projections.</p>
        </div>
        <div className="flex items-center gap-2">
          {dirtyAssets && <button onClick={saveAssetChanges} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition-colors">💾 Save Changes</button>}
          <button onClick={() => { setEditingAsset(null); setShowAssetModal(true); }} className={buttonPrimary}>+ Add Asset</button>
        </div>
      </div>
      {dirtyAssets && (
        <div className="p-2.5 bg-amber-500/10 border border-amber-500/40 rounded-lg text-sm text-amber-300">
          ⚠️ You have unsaved edits (including any deletions) — click <strong>💾 Save Changes</strong> to apply them. Leaving this tab without saving discards them.
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-4 py-3">
          <div className="text-slate-500 text-xs mb-0.5">Total Asset Value</div>
          <div className="text-xl font-bold text-emerald-400">{formatCurrency(totalAssetValue)}</div>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-4 py-3">
          <div className="text-slate-500 text-xs mb-0.5">Outstanding Debt</div>
          <div className="text-xl font-bold text-red-400">{formatCurrency(totalDebt)}</div>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-4 py-3">
          <div className="text-slate-500 text-xs mb-0.5">Net Equity</div>
          <div className="text-xl font-bold text-amber-400">{formatCurrency(totalEquity)}</div>
        </div>
      </div>
      
      {/* Quick Edit Table */}
      <div className={cardStyle}>
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
          <h4 className="text-lg font-semibold text-slate-100">Quick Edit - Assets</h4>
          <InfoCard
            title="Non-Liquid Assets"
            isOpen={assetInfoOpen}
            onToggle={() => setAssetInfoOpen(prev => !prev)}
            sections={[
              {
                heading: 'What This Table Does',
                body: 'This tracks your non-liquid assets — things that have value but aren\'t retirement investment accounts. These contribute to your net worth but generally aren\'t used to fund retirement spending directly. Think of them as the "other" side of your balance sheet.'
              },
              {
                heading: 'Column Definitions',
                items: [
                  { icon: '📝', label: 'Asset Name', desc: 'A descriptive name (e.g., "Primary Home", "Rental Property", "2022 Toyota"). For your reference only.' },
                  { icon: '🏷️', label: 'Type', desc: 'Category of asset: Real Estate, Vehicle, Business Equity, or Other. Currently used for labeling — all types appreciate at the rate you specify.' },
                  { icon: '💰', label: 'Value', desc: 'Current market value of the asset as of today. For real estate, use a realistic estimate of what it would sell for, not the purchase price.' },
                  { icon: '📈', label: 'Apprec.', desc: 'Annual appreciation rate. Real estate typically 2–4%, vehicles -10–15% (depreciation — enter as negative), businesses vary widely. This rate is applied each year to project future value.' },
                  { icon: '🏦', label: 'Debt', desc: 'Outstanding debt against this asset (mortgage balance, auto loan, etc.). This is subtracted from the value to calculate your equity.' },
                  { icon: '📅', label: 'Payoff', desc: 'The age at which the debt will be fully paid off. After this age, the full asset value counts as equity. For a 30-year mortgage, calculate your age when the last payment is made.' },
                  { icon: '✅', label: 'Equity', desc: 'Calculated automatically: Value minus Debt. This is your actual ownership stake and what contributes to your net worth.' }
                ]
              },
              {
                heading: 'How Assets Affect Your Plan',
                items: [
                  { icon: '📊', label: 'Net Worth', desc: 'Assets (net of debt) are added to your portfolio value in the Net Worth Projection chart. They appear as the pink "Non-Liquid Assets" layer.' },
                  { icon: '⚠️', label: 'Not Spendable', desc: 'Unlike retirement accounts, these assets are NOT used to fund retirement withdrawals. You can\'t easily spend your house equity for groceries (without selling it or taking a reverse mortgage).' },
                  { icon: '🏠', label: 'Legacy Value', desc: 'Assets contribute to your final net worth at your legacy age — they represent what you\'d leave to heirs even if your portfolio is depleted.' }
                ],
                tip: 'For vehicles, use a negative appreciation rate to model depreciation (e.g., -12% per year). For a home you plan to sell in retirement, you might model it here and then adjust your income streams to reflect the proceeds at the planned sale age.'
              }
            ]}
          />
          </div>
          {dirtyAssets && <button onClick={saveAssetChanges} className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-sm font-medium transition-colors">💾 Save Changes</button>}
        </div>
        <p className="text-xs text-slate-500 mb-4">Click any value to edit · Tab between fields · Click Save when done</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-max">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-3 px-1 text-slate-400 font-medium whitespace-nowrap">Asset Name</th>
                <th className="text-left py-3 px-1 text-slate-400 font-medium whitespace-nowrap">Type</th>
                <th className="text-right py-3 px-1 text-slate-400 font-medium whitespace-nowrap">Value</th>
                <th className="text-right py-3 px-1 text-slate-400 font-medium whitespace-nowrap">Apprec.</th>
                <th className="text-right py-3 px-1 text-slate-400 font-medium whitespace-nowrap">Debt</th>
                <th className="text-right py-3 px-1 text-slate-400 font-medium whitespace-nowrap">Payoff</th>
                <th className="text-right py-3 px-1 text-slate-400 font-medium whitespace-nowrap">Equity</th>
                <th className="text-center py-3 px-1 text-slate-400 font-medium whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {localAssets.map((asset, idx) => (
                <tr key={asset.id} className={`border-b border-slate-700/50 ${idx % 2 === 0 ? 'bg-slate-800/30' : ''}`}>
                  <td className="py-2 px-1">
                    <SpreadsheetCell
                      value={asset.name}
                      onChange={e => updateAsset(asset.id, 'name', e.target.value)}
                      style={{ width: `${maxNameWidth}ch` }}
                      className="bg-transparent border border-transparent rounded px-2 py-1.5 text-slate-100 font-medium focus:bg-slate-800 focus:border-amber-500/70 focus:outline-none hover:bg-slate-800/50 hover:border-slate-600 transition-colors"
                    />
                  </td>
                  <td className="py-2 px-1">
                    <GridSelect
                      value={asset.type}
                      onChange={e => updateAsset(asset.id, 'type', e.target.value)}
                      className="bg-transparent border border-transparent rounded px-1 py-1.5 text-slate-300 text-sm focus:bg-slate-800 focus:border-amber-500/70 focus:outline-none hover:bg-slate-800/50 hover:border-slate-600 transition-colors cursor-pointer"
                    >
                      {assetTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </GridSelect>
                  </td>
                  <td className="py-2 px-1 text-right">
                    <CurrencyCell
                      value={asset.value}
                      onValueChange={v => updateAsset(asset.id, 'value', v)}
                      className="bg-transparent border border-transparent rounded px-2 py-1.5 text-emerald-400 font-semibold text-right w-24 focus:bg-slate-800 focus:border-amber-500/70 focus:outline-none hover:bg-slate-800/50 hover:border-slate-600 transition-colors"
                    />
                  </td>
                  <td className="py-2 px-1 text-right">
                    <PercentCell
                      value={asset.appreciationRate}
                      onValueChange={v => updateAsset(asset.id, 'appreciationRate', v)}
                      className={`bg-transparent border border-transparent rounded px-1 py-1.5 font-medium text-right w-12 focus:bg-slate-800 focus:border-amber-500/70 focus:outline-none hover:bg-slate-800/50 hover:border-slate-600 transition-colors ${asset.appreciationRate >= 0 ? 'text-green-400' : 'text-red-400'}`}
                    />
                  </td>
                  <td className="py-2 px-1 text-right">
                    <CurrencyCell
                      value={asset.mortgage || 0}
                      onValueChange={v => updateAsset(asset.id, 'mortgage', v)}
                      className="bg-transparent border border-transparent rounded px-2 py-1.5 text-red-400 font-medium text-right w-24 focus:bg-slate-800 focus:border-amber-500/70 focus:outline-none hover:bg-slate-800/50 hover:border-slate-600 transition-colors"
                    />
                  </td>
                  <td className="py-2 px-1 text-right">
                    <AgeCell
                      value={asset.mortgagePayoffAge || ''}
                      onChange={e => updateAsset(asset.id, 'mortgagePayoffAge', e.target.value ? Number(e.target.value.replace(/[^0-9]/g, '')) : null)}
                      placeholder="—"
                      className="bg-transparent border border-transparent rounded px-1 py-1.5 text-slate-400 text-center w-12 focus:bg-slate-800 focus:border-amber-500/70 focus:outline-none hover:bg-slate-800/50 hover:border-slate-600 transition-colors"
                    />
                  </td>
                  <td className="py-2 px-1 text-right text-amber-400 font-semibold whitespace-nowrap">
                    {formatCurrency(asset.value - (asset.mortgage || 0))}
                  </td>
                  <td className="py-2 px-1 text-center">
                    <div className="flex justify-center gap-1">
                      <button tabIndex={-1} onClick={() => { setEditingAsset(asset); setShowAssetModal(true); }} className="text-slate-400 hover:text-amber-400 text-sm px-1 py-1" title="Edit all details">⚙️</button>
                      <button tabIndex={-1} onClick={() => { setLocalAssets(prev => prev.filter(a => a.id !== asset.id)); setDirtyAssets(true); }} className="text-slate-400 hover:text-red-400 text-sm px-1 py-1" title="Delete (applies on Save)">🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-600 bg-slate-800/50">
                <td colSpan="2" className="py-3 px-1 text-slate-300 font-semibold">Totals</td>
                <td className="py-3 px-1 text-right text-emerald-400 font-bold">{formatCurrency(totalAssetValue)}</td>
                <td></td>
                <td className="py-3 px-1 text-right text-red-400 font-bold">{formatCurrency(totalDebt)}</td>
                <td></td>
                <td className="py-3 px-1 text-right text-amber-400 font-bold">{formatCurrency(totalEquity)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      
      <div className="p-4 bg-slate-800/50 border border-slate-700/50 rounded-lg">
        <p className="text-sm text-slate-400">
          💡 <strong>Note:</strong> Non-liquid assets are included in your Total Net Worth on the Dashboard but do not affect retirement cash flow calculations. 
          They're useful for legacy planning and tracking overall wealth. Mortgages are assumed to pay down linearly until the payoff age.
        </p>
      </div>
    </div>
  );
}

// ============================================
// IncomeStreamsTab — Lifted to module scope
// ============================================
function IncomeStreamsTab({ detailLevel, sectionVisibility, setSectionVisibility, incomeStreams, incomeTypes, personalInfo, projections, setEditingIncome, setIncomeStreams, setShowIncomeModal }) {
  const [incomeInfoOpen, setIncomeInfoOpen] = useState(false);
  const [localIncomes, setLocalIncomes] = useState(incomeStreams);
  const [dirtyIncomes, setDirtyIncomes] = useState(false);
  
  // Detailed table state (embedded from former DetailedTableTab)
  const [tableStartAge, setTableStartAge] = useState(personalInfo.myRetirementAge);
  const tableData = projections.filter(p => p.myAge >= tableStartAge && p.myAge <= Math.min(tableStartAge + 30, personalInfo.legacyAge || 95));
  const charitablePercent = personalInfo.charitableGivingPercent || 0;
  
  // Re-sync on any external content change (see AssetsTab note); id-only keys
  // missed wizard relaunches that rebuild streams with the same id sequence.
  const incomeSig = JSON.stringify(incomeStreams);
  useEffect(() => {
    setLocalIncomes(incomeStreams);
    setDirtyIncomes(false);
  }, [incomeSig]);
  
  const updateIncome = (id, field, value) => {
    setLocalIncomes(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
    setDirtyIncomes(true);
  };
  const saveIncomeChanges = () => {
    setIncomeStreams(localIncomes);
    setDirtyIncomes(false);
  };
  
  const totalAnnualIncome = incomeStreams.reduce((sum, i) => sum + i.amount, 0);
  const maxNameWidth = Math.max(8, ...localIncomes.map(i => i.name.length + 2));
  
  return (
    <div className="space-y-6">
      <BasisLabel pi={personalInfo} />
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-semibold text-slate-100">Income Streams</h3>
        <div className="flex items-center gap-2">
          {dirtyIncomes && <button onClick={saveIncomeChanges} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition-colors">💾 Save Changes</button>}
          <button onClick={() => { setEditingIncome(null); setShowIncomeModal(true); }} className={buttonPrimary}>+ Add Income Stream</button>
        </div>
      </div>
      {dirtyIncomes && (
        <div className="p-2.5 bg-amber-500/10 border border-amber-500/40 rounded-lg text-sm text-amber-300">
          ⚠️ You have unsaved edits (including any deletions) — click <strong>💾 Save Changes</strong> to apply them. Leaving this tab without saving discards them.
        </div>
      )}
      
      <SectionControls tab="income" vis={sectionVisibility} setVis={setSectionVisibility}
                       level={detailLevel} />
      {/* Quick Edit Table */}
      <HideableBlock tab="income" id="quickEdit" level={detailLevel}
                     vis={sectionVisibility} setVis={setSectionVisibility}>
        <div className={cardStyle}>
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
            <h4 className="text-lg font-semibold text-slate-100">Quick Edit - Income Streams</h4>
            <InfoCard
              title="Income Streams"
              isOpen={incomeInfoOpen}
              onToggle={() => setIncomeInfoOpen(prev => !prev)}
              sections={[
                {
                  heading: 'What This Table Does',
                  body: 'This defines all your income sources — both current (like salary) and future (like Social Security and pensions). Each row is a stream of income that starts and stops at specific ages. The planner uses these to calculate how much of your retirement spending is covered by guaranteed income vs. portfolio withdrawals.'
                },
                {
                  heading: 'Column Definitions',
                  items: [
                    { icon: '📝', label: 'Name', desc: 'A descriptive label (e.g., "My Social Security", "John\'s Pension", "Part-time Consulting"). For your reference only.' },
                    { icon: '🏷️', label: 'Type', desc: 'The category of income. This affects how the planner treats it for tax calculations: Earned Income is subject to payroll taxes and signals you\'re still working. Social Security uses special IRS taxation rules (only 50–85% may be taxable). Pension and Other Income are taxed as ordinary income.' },
                    { icon: '👤', label: 'Owner', desc: '"Me", "Spouse", or "Joint". Determines whose age triggers the start/stop of this stream, and — when survivor modeling is on — whether it stops at that person\'s death. Choose Joint for household income that keeps paying after the first death: rental income, a joint-and-survivor annuity, a business interest. Its ages follow yours. Social Security is always individual, so Joint is not offered there; the survivor automatically keeps the higher of the two benefits.' },
                    { icon: '💰', label: 'Amount', desc: 'Annual income in today\'s dollars. For Social Security, enter your estimated annual benefit at the claiming age you plan to use (check ssa.gov for your estimate). For salary, enter your current annual gross pay.' },
                    { icon: '📈', label: 'COLA', desc: 'Cost-of-Living Adjustment — the annual percentage increase for this income. Social Security typically gets 2–3% COLA. Pensions may have 0–2%. Salary might grow 2–4%. This compounds each year from the start age.' },
                    { icon: '📅', label: 'Ages', desc: `The start and end ages for this income. Social Security: typically 62 to your planning age (or your chosen claiming age). Salary: current age to retirement age. Pension: pension start age to your planning age. Set end age to ${personalInfo.legacyAge || 95} for lifetime income.` }
                  ]
                },
                {
                  heading: 'Income Types Explained',
                  items: [
                    { icon: '💼', label: 'Earned Income', desc: 'Salary, wages, or self-employment income. Having earned income tells the planner you\'re still working — it won\'t draw from your portfolio during these years (except for RMDs if applicable). Subject to payroll taxes.' },
                    { icon: '🏛️', label: 'Social Security', desc: 'Your SS benefit. Taxed differently than other income: depending on your total income, 0%, 50%, or up to 85% of your benefit may be subject to federal income tax. The planner handles this automatically using IRS combined income thresholds.' },
                    { icon: '📋', label: 'Pension', desc: 'Defined-benefit pension payments. Fully taxed as ordinary income. If your pension has a COLA provision, enter the annual adjustment rate.' },
                    { icon: '📦', label: 'Other Income', desc: 'Catch-all for rental income, annuity payments, part-time work in retirement, royalties, etc. Taxed as ordinary income.' }
                  ]
                },
                {
                  heading: 'Tips',
                  items: [
                    { icon: '🔑', label: 'Social Security Claiming Age', desc: 'The start age for SS has a huge impact. Benefits are permanently reduced ~6–7% per year before Full Retirement Age (66–67) and increase 8% per year from FRA to age 70. The planner applies these adjustments automatically based on your birth year.' },
                    { icon: '👫', label: 'Spousal Benefits', desc: 'Add separate income streams for each spouse\'s Social Security, pension, etc. Set the owner field to match. The planner uses each person\'s age independently.' },
                    { icon: '📊', label: 'Impact on Dashboard', desc: 'These income streams flow directly into the "Retirement Income" summary card, the stacked bars in the Income vs Spending chart, and the Cash Flow Sankey diagram. They determine how much the planner needs to pull from your portfolio.' }
                  ],
                  tip: 'Not sure about your Social Security amount? Visit ssa.gov/myaccount to get your personalized estimate. Enter the amount for the age you plan to claim — the planner will apply the correct early/delayed claiming adjustments.'
                }
              ]}
            />
            </div>
            {dirtyIncomes && <button onClick={saveIncomeChanges} className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-sm font-medium transition-colors">💾 Save Changes</button>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 px-1 text-slate-400 font-medium whitespace-nowrap">Name</th>
                  <th className="text-left py-3 px-1 text-slate-400 font-medium whitespace-nowrap">Type</th>
                  <th className="text-left py-3 px-1 text-slate-400 font-medium whitespace-nowrap">Owner</th>
                  <th className="text-right py-3 px-1 text-slate-400 font-medium whitespace-nowrap">Amount</th>
                  <th className="text-right py-3 px-1 text-slate-400 font-medium whitespace-nowrap">COLA</th>
                  <th className="text-center py-3 px-1 text-slate-400 font-medium whitespace-nowrap" title="Checked: the amount is in today's dollars and COLA compounds from today — future-dated streams get indexed up to their start age. Unchecked: the amount is what you'll actually receive in the first year (COLA starts at the start age).">Today's $</th>
                  <th className="text-center py-3 px-1 text-slate-400 font-medium whitespace-nowrap">Ages</th>
                  <th className="text-center py-3 px-1 text-slate-400 font-medium whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {localIncomes.map((stream, idx) => (
                  <tr key={stream.id} className={`border-b border-slate-700/50 ${idx % 2 === 0 ? 'bg-slate-800/30' : ''}`}>
                    <td className="py-2 px-1">
                      <SpreadsheetCell
                        value={stream.name}
                        onChange={e => updateIncome(stream.id, 'name', e.target.value)}
                        style={{ width: `${maxNameWidth}ch` }}
                        className="bg-transparent border border-transparent rounded px-2 py-1.5 text-slate-100 font-medium focus:bg-slate-800 focus:border-amber-500/70 focus:outline-none hover:bg-slate-800/50 hover:border-slate-600 transition-colors"
                      />
                    </td>
                    <td className="py-2 px-1">
                      <GridSelect
                        value={stream.type}
                        onChange={e => updateIncome(stream.id, 'type', e.target.value)}
                        className="bg-transparent border border-transparent rounded px-1 py-1.5 text-slate-300 text-sm focus:bg-slate-800 focus:border-amber-500/70 focus:outline-none hover:bg-slate-800/50 hover:border-slate-600 transition-colors cursor-pointer"
                      >
                        {incomeTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </GridSelect>
                    </td>
                    <td className="py-2 px-1">
                      <GridSelect
                        value={stream.owner}
                        onChange={e => updateIncome(stream.id, 'owner', e.target.value)}
                        className="bg-transparent border border-transparent rounded px-1 py-1.5 text-slate-300 text-sm focus:bg-slate-800 focus:border-amber-500/70 focus:outline-none hover:bg-slate-800/50 hover:border-slate-600 transition-colors cursor-pointer"
                      >
                        <option value="me">Me</option>
                        <option value="spouse">Spouse</option>
                        {/* Social Security is always an individual entitlement, and
                            the survivor rule works by finding the OTHER spouse's
                            stream — a joint one would have no other side. Every
                            other kind of income can belong to the household. */}
                        {stream.type !== 'social_security' && <option value="joint">Joint</option>}
                      </GridSelect>
                    </td>
                    <td className="py-2 px-1">
                      <CurrencyCell
                        value={stream.amount}
                        onValueChange={v => updateIncome(stream.id, 'amount', v)}
                        className="bg-transparent border border-transparent rounded px-2 py-1.5 text-emerald-400 font-semibold text-right w-20 focus:bg-slate-800 focus:border-amber-500/70 focus:outline-none hover:bg-slate-800/50 hover:border-slate-600 transition-colors"
                      />
                    </td>
                    <td className="py-2 px-1">
                      <PercentCell
                        value={stream.cola}
                        onValueChange={v => updateIncome(stream.id, 'cola', v)}
                        className="bg-transparent border border-transparent rounded px-2 py-1.5 text-sky-400 font-semibold text-right w-16 focus:bg-slate-800 focus:border-amber-500/70 focus:outline-none hover:bg-slate-800/50 hover:border-slate-600 transition-colors"
                      />
                    </td>
                    <td className="py-2 px-1 text-center">
                      <input
                        type="checkbox"
                        checked={!!stream.todaysDollars}
                        onChange={e => updateIncome(stream.id, 'todaysDollars', e.target.checked)}
                        className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-amber-500 cursor-pointer"
                        title="Amount is in today's dollars — COLA compounds from today, so a future-dated stream is indexed up to its start age"
                      />
                    </td>
                    <td className="py-2 px-1">
                      <div className="flex items-center justify-center gap-0.5">
                        <AgeCell
                          value={stream.startAge}
                          onChange={e => updateIncome(stream.id, 'startAge', Number(e.target.value))}
                          className="w-12 bg-transparent border border-transparent rounded px-1 py-1.5 text-amber-400 font-medium text-center text-sm focus:bg-slate-800 focus:border-amber-500/70 focus:outline-none hover:bg-slate-800/50 hover:border-slate-600 transition-colors"
                        />
                        <span className="text-slate-500">-</span>
                        <AgeCell
                          value={stream.endAge}
                          onChange={e => updateIncome(stream.id, 'endAge', Number(e.target.value))}
                          className="w-12 bg-transparent border border-transparent rounded px-1 py-1.5 text-amber-400 font-medium text-center text-sm focus:bg-slate-800 focus:border-amber-500/70 focus:outline-none hover:bg-slate-800/50 hover:border-slate-600 transition-colors"
                        />
                      </div>
                    </td>
                    <td className="py-2 px-1 text-center">
                      <div className="flex justify-center gap-1">
                        <button tabIndex={-1} onClick={() => { setEditingIncome(stream); setShowIncomeModal(true); }} className="text-slate-400 hover:text-amber-400 text-sm px-1 py-1" title="Edit all details">⚙️</button>
                        <button tabIndex={-1} onClick={() => { setLocalIncomes(prev => prev.filter(i => i.id !== stream.id)); setDirtyIncomes(true); }} className="text-slate-400 hover:text-red-400 text-sm px-1 py-1" title="Delete (applies on Save)">🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-600 bg-slate-800/50">
                  {/* This is the column sum, NOT household income in any year — the
                      streams above start and stop at different ages, so a salary
                      ending at 65 is being added to a benefit starting at 67. It is
                      also a mix of dollar bases: each amount is in today's dollars
                      or nominal at its own start age depending on that stream's
                      "Today's $" setting. Labelled for what it is; the Dashboard's
                      income chart is the figure to read for any given year. */}
                  <td colSpan="3" className="py-3 px-1 text-slate-300 font-semibold">
                    Sum of all entries
                    <span className="block text-xs font-normal text-slate-500">
                      Not income in any one year — these start and stop at different ages
                    </span>
                  </td>
                  <td className="py-3 px-1 text-right text-emerald-400 font-bold">{formatCurrency(totalAnnualIncome)}</td>
                  <td colSpan="4"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </HideableBlock>
      
      {/* Detailed Annual Projections (formerly its own tab) */}
      <HideableBlock tab="income" id="projectionTable" level={detailLevel}
                     vis={sectionVisibility} setVis={setSectionVisibility}>
        <div className="border-t border-slate-700/50 pt-6 mt-6">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <h3 className="text-xl font-semibold text-slate-100">Detailed Annual Projections</h3>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-400">Starting Age:</label>
            <input type="number" value={tableStartAge} onChange={e => setTableStartAge(Number(e.target.value))} className="w-20 bg-slate-900 border border-slate-600 rounded px-3 py-1 text-slate-100" />
          </div>
        </div>
        <div className={`${cardStyle} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-3 px-2 text-slate-400 font-medium">Age</th>
                <th className="text-right py-3 px-2 text-slate-400 font-medium">Year</th>
                <th className="text-right py-3 px-2 text-slate-400 font-medium">Desired Income</th>
                <th className="text-right py-3 px-2 text-slate-400 font-medium">Social Security</th>
                <th className="text-right py-3 px-2 text-slate-400 font-medium">Pension</th>
                <th className="text-right py-3 px-2 text-slate-400 font-medium">Other Income</th>
                <th className="text-right py-3 px-2 text-slate-400 font-medium">Portfolio Draw</th>
                <th className="text-right py-3 px-2 text-slate-400 font-medium">RMD</th>
                <th className="text-right py-3 px-2 text-emerald-400 font-medium">QCD</th>
                <th className="text-right py-3 px-2 font-medium" style={{ color: SERIES.rothConversion }}>Roth Conv.</th>
                <th className="text-right py-3 px-2 text-amber-400 font-medium">Taxable Income</th>
                <th className="text-right py-3 px-2 text-amber-400 font-medium">MAGI</th>
                <th className="text-right py-3 px-2 text-slate-400 font-medium">Federal Tax</th>
                <th className="text-right py-3 px-2 text-amber-400 font-medium">State Taxable</th>
                <th className="text-right py-3 px-2 text-slate-400 font-medium">State Tax</th>
                <th className="text-right py-3 px-2 text-slate-400 font-medium">FICA</th>
                <th className="text-right py-3 px-2 text-slate-400 font-medium">IRMAA</th>
                <th className="text-right py-3 px-2 text-slate-400 font-medium">Net Income</th>
                <th className="text-right py-3 px-2 text-slate-400 font-medium">Portfolio</th>
              </tr>
            </thead>
            <tbody>
              {tableData.map((row, idx) => (
                <tr key={row.year} className={`border-b ${row.survivorEvent ? 'border-red-500/30' : 'border-slate-700/50'} ${
                  // One tint per row, most important first. These were five
                  // separate classes appended together, which left the winner
                  // to stylesheet order: a survivor year's red border never
                  // showed, and the striping could bury a highlight.
                  row.unfundedShortfall > 0 ? 'bg-red-900/25'
                  : row.survivorEvent ? 'bg-red-900/15'
                  : row.rothConversion > 0 ? 'bg-purple-900/10'
                  : row.oneTimeEvents?.length ? 'bg-amber-900/10'
                  : row.qcd > 0 ? 'bg-emerald-900/10'
                  : idx % 2 === 0 ? 'bg-slate-800/30' : ''}`}>
                  <td className="py-2 px-2 text-slate-100 font-medium">
                    {row.myAge}
                    {row.survivorEvent === 'spouse_died' && <span title="Spouse passed" className="ml-1">🕊️</span>}
                    {row.survivorEvent === 'primary_died' && <span title="Primary passed" className="ml-1">🕊️</span>}
                    {row.effectiveFilingStatus === 'single' && <span title="Filing as Single" className="ml-1 text-xs text-red-400">(S)</span>}
                  </td>
                  <td className="py-2 px-2 text-right text-slate-300">{row.year}</td>
                  <td className="py-2 px-2 text-right text-amber-400">
                    {formatCurrency(row.desiredIncome)}
                    {row.healthcareExpense > 0 && <div className="text-xs text-pink-400" title="Healthcare costs">+{formatCurrency(row.healthcareExpense)} HC</div>}
                    {row.recurringExpenses > 0 && <div className="text-xs text-cyan-400" title="Recurring expenses">+{formatCurrency(row.recurringExpenses)} RE</div>}
                    {row.oneTimeExpense > 0 && <div className="text-xs text-red-400">+{formatCurrency(row.oneTimeExpense)}</div>}
                  </td>
                  <td className="py-2 px-2 text-right" style={{ color: SERIES.socialSecurity }}>
                    {formatCurrency(row.socialSecurity)}
                    {row.ssEarningsTestReduction > 0 && <div className="text-xs text-red-400" title="SS reduced by earnings test">-{formatCurrency(row.ssEarningsTestReduction)} ET</div>}
                  </td>
                  <td className="py-2 px-2 text-right" style={{ color: SERIES.pension }}>{formatCurrency(row.pension)}</td>
                  <td className="py-2 px-2 text-right" style={{ color: SERIES.otherIncome }}>{formatCurrency(row.otherIncome)}</td>
                  <td className="py-2 px-2 text-right" style={{ color: SERIES.withdrawalVoluntary }}>
                    {formatCurrency(row.portfolioWithdrawal)}
                    {row.contributionsPaused > 0 && (
                      <div className="text-xs text-sky-300" title="Saving paused this year to pay for an expense dated before retirement">
                        paused {formatCurrency(row.contributionsPaused)} saving
                      </div>
                    )}
                    {row.unfundedShortfall > 0 && (
                      <div className="text-xs text-red-400" title="Spending this year's portfolio could not fund — the plan is short by this much">
                        short {formatCurrency(row.unfundedShortfall)}
                      </div>
                    )}
                    {row.annuityPremium > 0 && (
                      <div className="text-xs text-violet-300" title="Premium paid this year to buy an annuity — it leaves the funding account, not the spending target">
                        {formatCurrency(row.annuityPremium)} annuity premium
                      </div>
                    )}
                    {row.bracketFillBracket && row.bracketFillDraw > 0 && row.bracketFillDraw >= row.bracketFillRoom - 1 && (
                      <div className="text-xs text-slate-400" title={`Pre-tax withdrawals stopped at the top of the ${row.bracketFillBracket} bracket; the rest of the year's spending came from the accounts next in your withdrawal order`}>
                        {row.bracketFillBracket} bracket: {formatCurrency(row.bracketFillDraw)}
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right" style={{ color: SERIES.rmd }}>{row.rmd > 0 ? formatCurrency(row.rmd) : '—'}</td>
                  <td className="py-2 px-2 text-right text-emerald-400 font-medium">{row.qcd > 0 ? formatCurrency(row.qcd) : '—'}</td>
                  <td className="py-2 px-2 text-right font-medium" style={{ color: SERIES.rothConversion }}>{row.rothConversion > 0 ? formatCurrency(row.rothConversion) : '—'}</td>
                  <td className="py-2 px-2 text-right text-amber-400">{formatCurrency(row.taxableIncome)}</td>
                  <td className="py-2 px-2 text-right text-amber-400">{formatCurrency(row.magi)}</td>
                  <td className="py-2 px-2 text-right text-red-400">
                    ({formatCurrency(row.federalTax)})
                    {row.earlyWithdrawalPenalty > 0 && (
                      <div className="text-xs text-red-300" title="10% §72(t) additional tax on pre-tax withdrawals before age 59½ (included in the federal tax above)">
                        incl. {formatCurrency(row.earlyWithdrawalPenalty)} 72(t)
                      </div>
                    )}
                    {row.rothUnseasonedDrawn > 0 && (
                      <div className="text-xs text-red-300" title="Converted dollars drawn within five tax years of the conversion, before 59½ — penalised under the Roth 5-year rule (§408A(d)(3)(F)); the penalty is inside the 72(t) figure above">
                        {formatCurrency(row.rothUnseasonedDrawn)} from a Roth conversion under 5 yrs old
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right text-amber-400">{formatCurrency(row.stateTaxableIncome)}</td>
                  <td className="py-2 px-2 text-right text-red-400">({formatCurrency(row.stateTax)})</td>
                  <td className="py-2 px-2 text-right text-red-400">{row.ficaTax > 0 ? `(${formatCurrency(row.ficaTax)})` : '—'}</td>
                  <td className="py-2 px-2 text-right text-red-400">{row.irmaaSurcharge > 0 ? `(${formatCurrency(row.irmaaSurcharge)})` : '—'}</td>
                  <td className="py-2 px-2 text-right text-emerald-400 font-medium">{formatCurrency(row.netIncome)}</td>
                  <td className="py-2 px-2 text-right text-slate-300">{formatCurrency(row.totalPortfolio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {charitablePercent > 0 && (
          <div className="p-3 bg-emerald-900/20 border border-emerald-700/30 rounded-lg">
            <p className="text-sm text-emerald-300">
              <strong>💡 QCD Active ({charitablePercent}% charitable giving):</strong> Starting at age 70, your charitable giving is fulfilled via Qualified Charitable Distributions from your IRA. 
              QCD amounts are excluded from taxable income, reducing your tax burden while still allowing the standard deduction.
            </p>
          </div>
        )}
        {conversionIsActive(personalInfo) && (
          <div className="p-3 bg-purple-900/20 border border-purple-700/30 rounded-lg">
            <p className="text-sm text-purple-300">
              <strong>🔄 Roth Conversions Active ({conversionModeLabel(personalInfo)}, ages {personalInfo.rothConversionStartAge || getDefaultRothConversionWindow(personalInfo).startAge}–{personalInfo.rothConversionEndAge || getDefaultRothConversionWindow(personalInfo).endAge}):</strong> Purple-highlighted rows show years where conversions execute. The converted amount increases taxable income (and federal/state tax) that year but shifts assets to tax-free Roth growth. Watch the "Portfolio" column — pre-tax balance decreases while Roth balance grows, reducing future RMDs.
            </p>
          </div>
        )}
      </div>

        </div>
      </HideableBlock>
      
    </div>
  );
}

