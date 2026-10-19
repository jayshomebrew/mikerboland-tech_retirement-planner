// ── Module-scope constants and modal components ─────────────────────────────
// Hoisted out of RetirementPlanner so React keeps a stable component identity
// across parent renders. Inner-function components were unmounting/remounting
// on every parent state change, blowing away the user's in-progress form input.
const ASSET_TYPES = [
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'business', label: 'Business Ownership' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'collectibles', label: 'Collectibles/Art' },
  { value: 'other', label: 'Other Asset' }
];

const ACCOUNT_TYPES = [
  { value: '401k', label: '401(k)' },
  { value: 'roth_401k', label: 'Roth 401(k)' },
  { value: '403b', label: '403(b)' },
  { value: 'roth_403b', label: 'Roth 403(b)' },
  { value: 'roth_ira', label: 'Roth IRA' },
  { value: 'traditional_ira', label: 'Traditional IRA' },
  { value: 'brokerage', label: 'Brokerage' },
  { value: '457b', label: '457(b)' },
  { value: 'roth_457b', label: 'Roth 457(b)' },
  { value: 'hsa', label: 'HSA' }
];

// 'Both' used to be a third option here. It lumped the employee deferral and the
// employer match into one unsplittable number, and every consumer guessed
// differently — the savings rate counted it as neither, the tax engine deducted
// none of it, the contribution-limit check counted all of it as deferral. Use
// percent-of-salary mode when an account holds both: it carries employeePercent
// and employerMatchPercent separately, which is the information 'Both' destroyed.
const CONTRIBUTOR_TYPES = [
  { value: 'me', label: 'Me' },
  { value: 'employer', label: 'Employer' }
];

const INCOME_TYPES = [
  { value: 'earned_income', label: 'Earned Income (Salary/Wages)' },
  { value: 'social_security', label: 'Social Security' },
  { value: 'pension', label: 'Pension' },
  { value: 'business', label: 'Business Income' },
  { value: 'rental', label: 'Rental Income' },
  { value: 'annuity', label: 'Annuity (SPIA, QLAC, deferred)' },
  { value: 'other', label: 'Other Income' }
];

function AccountModal({ editingAccount, personalInfo, incomeStreams, onClose, onSave }) {
  const [formData, setFormData] = useState(editingAccount || { name: '', type: '401k', balance: 0, contribution: 0, contributionGrowth: personalInfo.inflationRate || 0.03, cagr: 0.07, startAge: personalInfo.myAge, stopAge: personalInfo.myRetirementAge, owner: 'me', contributor: 'me', costBasisPercent: 0.50 });
  const isPercentMode = formData.contributionMode === 'percent';
  const percentEligible = (formData.owner === 'me' || formData.owner === 'spouse')
    && ['401k','roth_401k','traditional_ira','roth_ira','403b'].includes(formData.type);
  const ownerSalaryStream = isPercentMode
    ? incomeStreams.find(s => s.type === 'earned_income' && s.owner === formData.owner)
    : null;
  const employeeFrac = Number(formData.employeePercent) || 0;
  const matchFrac = Number(formData.employerMatchPercent) || 0;
  const totalFrac = employeeFrac + matchFrac;
  const year1Contrib = ownerSalaryStream ? Math.round(ownerSalaryStream.amount * totalFrac) : null;
  const year30Salary = ownerSalaryStream ? ownerSalaryStream.amount * Math.pow(1 + (ownerSalaryStream.cola || 0), 30) : null;
  const year30Contrib = year30Salary !== null ? Math.round(year30Salary * totalFrac) : null;
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`${cardStyle} max-w-lg w-full max-h-[90vh] overflow-y-auto`}>
        <h3 className="text-xl font-bold text-slate-100 mb-6">{editingAccount ? 'Edit Account' : 'Add New Account'}</h3>
        <div className="space-y-4">
          <div><label className={labelStyle}>Account Name</label><input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className={inputStyle} /></div>
          <div><label className={labelStyle}>Account Type</label><select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className={inputStyle}>{ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelStyle}>Owner</label><select value={formData.owner} onChange={e => {
              const owner = e.target.value;
              const next = {...formData, owner};
              // New accounts: re-seed the start/stop age defaults to the selected owner's
              // ages (joint accounts follow "me"). Edited accounts keep their saved ages.
              if (!editingAccount) {
                next.startAge = owner === 'spouse' ? (personalInfo.spouseAge ?? personalInfo.myAge) : personalInfo.myAge;
                next.stopAge = owner === 'spouse' ? (personalInfo.spouseRetirementAge ?? personalInfo.myRetirementAge) : personalInfo.myRetirementAge;
              }
              setFormData(next);
            }} className={inputStyle}><option value="me">Me</option><option value="spouse">Spouse</option><option value="joint">Joint</option></select></div>
            {/* In percent mode the employee/employer split IS the two percentages
                below, so this dropdown has no effect — the engine ignores it. It
                used to render anyway, which let a row say "Contributor: Employer"
                while its 3% employee rate was still counted as the saver's own
                elective deferral against 402(g) and deducted from AGI. Showing the
                split read-only states what the engine will actually do. */}
            {isPercentMode ? (
              <div>
                <label className={labelStyle}>Contributor</label>
                <div className="text-sm text-slate-400 bg-slate-800/60 border border-slate-700/50 rounded px-3 py-2">
                  Set by the % split below
                </div>
              </div>
            ) : (
              <div><label className={labelStyle}>Contributor</label><select value={formData.contributor || 'me'} onChange={e => setFormData({...formData, contributor: e.target.value})} className={inputStyle}>{CONTRIBUTOR_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
            )}
          </div>
          {percentEligible && (
            <div className="border-t border-slate-700/50 pt-3">
              <label className={labelStyle}>Contribution Mode</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFormData({...formData, contributionMode: 'fixed'})}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition ${!isPercentMode ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-slate-800/60 text-slate-400 border-slate-700/50 hover:text-slate-200'}`}
                >$ Fixed Amount</button>
                <button
                  type="button"
                  onClick={() => setFormData({...formData, contributionMode: 'percent', employeePercent: formData.employeePercent ?? 0.10, employerMatchPercent: formData.employerMatchPercent ?? 0.04, contributionGrowth: 0})}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition ${isPercentMode ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-slate-800/60 text-slate-400 border-slate-700/50 hover:text-slate-200'}`}
                >% of Salary</button>
              </div>
              {isPercentMode && (
                <p className="text-xs text-slate-500 mt-2">Pulls from this owner's earned-income stream. If you also have a separate "Employer Match" account, delete it to avoid double-counting.</p>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelStyle}>Current Balance</label><input type="number" value={formData.balance} onChange={e => setFormData({...formData, balance: Number(e.target.value)})} className={inputStyle} /></div>
            {!isPercentMode && (
              <div><label className={labelStyle}>Annual Contribution</label><input type="number" value={formData.contribution} onChange={e => setFormData({...formData, contribution: Number(e.target.value)})} className={inputStyle} /></div>
            )}
            {isPercentMode && (
              <div><label className={labelStyle}>Expected CAGR (%)</label><input type="number" step="0.1" value={(formData.cagr * 100).toFixed(1)} onChange={e => setFormData({...formData, cagr: Number(e.target.value) / 100})} className={inputStyle} /></div>
            )}
          </div>
          {!isPercentMode && (
            <div className="grid grid-cols-2 gap-4">
              <div><label className={labelStyle}>Contribution Growth (%/yr)</label><input type="number" step="0.1" value={((formData.contributionGrowth || 0) * 100).toFixed(1)} onChange={e => setFormData({...formData, contributionGrowth: Number(e.target.value) / 100})} className={inputStyle} /></div>
              <div><label className={labelStyle}>Expected CAGR (%)</label><input type="number" step="0.1" value={(formData.cagr * 100).toFixed(1)} onChange={e => setFormData({...formData, cagr: Number(e.target.value) / 100})} className={inputStyle} /></div>
            </div>
          )}
          {isPercentMode && (
            <div className="p-3 bg-slate-800/60 border border-slate-700/50 rounded-lg space-y-3">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className={labelStyle} style={{marginBottom: 0}}>Employee Contribution</label>
                  <span className="text-sm font-semibold text-amber-300">{(employeeFrac * 100).toFixed(1)}%</span>
                </div>
                <input type="range" min="0" max="0.25" step="0.005" value={employeeFrac}
                  onChange={e => setFormData({...formData, employeePercent: Number(e.target.value)})}
                  className="w-full" />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className={labelStyle} style={{marginBottom: 0}}>Employer Match</label>
                  <span className="text-sm font-semibold text-amber-300">{(matchFrac * 100).toFixed(1)}%</span>
                </div>
                <input type="range" min="0" max="0.25" step="0.005" value={matchFrac}
                  onChange={e => setFormData({...formData, employerMatchPercent: Number(e.target.value)})}
                  className="w-full" />
              </div>
              <div className="text-xs text-slate-400 border-t border-slate-700/50 pt-2">
                {ownerSalaryStream ? (
                  <>Year 1: <span className="text-emerald-400 font-semibold">${year1Contrib.toLocaleString()}</span>
                  {' → '}Year 30: <span className="text-emerald-400 font-semibold">${year30Contrib.toLocaleString()}</span>
                  <span className="text-slate-500"> (salary ${Math.round(ownerSalaryStream.amount).toLocaleString()} × {(totalFrac*100).toFixed(1)}%)</span></>
                ) : (
                  <span className="text-rose-400">No earned-income stream found for this owner. Add one in the Income tab — contribution will be $0 otherwise.</span>
                )}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelStyle}>Contribution Start Age</label><input type="number" value={formData.startAge} onChange={e => setFormData({...formData, startAge: Number(e.target.value)})} className={inputStyle} /></div>
            <div><label className={labelStyle}>Contribution Stop Age</label><input type="number" value={formData.stopAge} onChange={e => setFormData({...formData, stopAge: Number(e.target.value)})} className={inputStyle} /></div>
          </div>
          {(() => {
            const ownerRetAge = formData.owner === 'spouse'
              ? (personalInfo.spouseRetirementAge || personalInfo.myRetirementAge)
              : personalInfo.myRetirementAge;
            return (
              <p className="text-xs text-slate-500">
                The stop age is exclusive — the last contribution happens the year BEFORE the stop age.
                {ownerRetAge ? ` Typically set it to ${formData.owner === 'spouse' ? "the spouse's" : 'your'} retirement age (${ownerRetAge}): contributions then stop exactly when retirement begins.` : ''}
              </p>
            );
          })()}
          {formData.type === 'brokerage' && (
            <div className="p-3 bg-slate-800/60 border border-slate-700/50 rounded-lg">
              <label className={labelStyle}>Cost Basis (% of current balance)</label>
              <input
                type="number"
                step="1"
                min="0"
                max="100"
                value={Math.round(((formData.costBasisPercent ?? 0.50) * 100))}
                onChange={e => setFormData({...formData, costBasisPercent: Math.min(1, Math.max(0, Number(e.target.value) / 100))})}
                className={inputStyle}
              />
              <p className="text-xs text-slate-400 mt-2">
                What % of this balance is your cost basis (after-tax dollars you contributed)?
                The remainder is unrealized capital gains. New accounts: ~95%. Old accounts with deep gains: 30–50%. Default: 50%.
              </p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-8">
          <button onClick={onClose} className={buttonSecondary}>Cancel</button>
          <button onClick={() => onSave(formData)} className={buttonPrimary}>Save Account</button>
        </div>
      </div>
    </div>
  );
}

function IncomeModal({ editingIncome, personalInfo, incomeStreams = [], onClose, onSave }) {
  const [formData, setFormData] = useState(editingIncome || { name: '', type: 'pension', amount: 0, startAge: 62, endAge: 95, cola: 0.02, owner: 'me', pia: 0 });

  // ── Government pension estimator state ──────────────────────────────────────
  const [estOpen, setEstOpen] = useState(false);
  const [est, setEst] = useState({
    system: 'fers',
    yearsOfService: 20,
    salaryMode: 'project',       // 'project' (from current salary) | 'direct' (enter high-3)
    currentSalary: 100000,
    salaryGrowth: personalInfo.inflationRate || 0.03,
    high3Direct: 0,
    stateMultiplier: 0.02,
    survivorElection: false,
    addSupplement: true,
    ssAt62: 0,
  });

  const ownerCurAge = formData.owner === 'spouse' ? personalInfo.spouseAge : personalInfo.myAge;
  const ownerRetAge = formData.owner === 'spouse'
    ? (personalInfo.spouseRetirementAge || personalInfo.myRetirementAge)
    : personalInfo.myRetirementAge;
  const yearsUntilRet = Math.max(0, ownerRetAge - ownerCurAge);
  const estAvailable = typeof estimateGovernmentPension === 'function';

  // Live estimate preview (recomputed on every render from `est`).
  const estResult = estAvailable ? estimateGovernmentPension({
    system: est.system,
    yearsOfService: Number(est.yearsOfService) || 0,
    retirementAge: ownerRetAge,
    currentSalary: Number(est.currentSalary) || 0,
    salaryGrowth: Number(est.salaryGrowth) || 0,
    yearsUntilRetirement: yearsUntilRet,
    high3Direct: est.salaryMode === 'direct' ? (Number(est.high3Direct) || 0) : null,
    stateMultiplier: Number(est.stateMultiplier) || 0,
    inflationRate: personalInfo.inflationRate || 0.03,
    survivorElection: est.survivorElection,
  }) : null;

  const isFersEarly = est.system === 'fers' && ownerRetAge < 62;
  // Default the SS-at-62 field from this owner's Social Security stream, if any.
  const ownerSSStream = incomeStreams.find(s => s.type === 'social_security' && s.owner === formData.owner);
  const supplementSS = Number(est.ssAt62) > 0 ? Number(est.ssAt62) : (ownerSSStream ? ownerSSStream.amount : 0);
  const supplementPreview = (estAvailable && isFersEarly && est.addSupplement && typeof estimateFersSupplement === 'function')
    ? estimateFersSupplement({ ssAt62Annual: supplementSS, yearsOfService: Number(est.yearsOfService) || 0 })
    : 0;

  const buildSupplementStream = () => {
    // Only FERS employees retiring before 62 qualify for the Special Retirement
    // Supplement. This is evaluated at Apply time (not Save time) so it reflects
    // the system the user actually estimated — never the estimator's default.
    if (!(estAvailable && isFersEarly && est.addSupplement) || supplementPreview <= 0) return null;
    return {
      name: 'FERS Supplement',
      type: 'pension',
      amount: supplementPreview,
      startAge: ownerRetAge,
      endAge: 61,                 // paid until the month before age 62
      cola: 0,                    // the supplement gets no COLA
      owner: formData.owner,
      todaysDollars: false,
    };
  };

  const applyEstimate = () => {
    if (!estResult) return;
    setFormData({
      ...formData,
      name: formData.name && formData.name.trim() ? formData.name : `${(GOV_PENSION_SYSTEMS[est.system] || {}).label || 'Government'} Pension`,
      amount: estResult.annualPension,
      cola: estResult.colaRate,
      colaStartAge: estResult.colaStartAge || undefined,
      startAge: ownerRetAge,
      todaysDollars: false,       // the estimate is nominal at retirement
      survivorBenefit: est.survivorElection ? true : formData.survivorBenefit,
      survivorBenefitRate: est.survivorElection ? 0.5 : formData.survivorBenefitRate,
      // Stash the qualifying supplement (or clear a stale one) at Apply time. Save
      // uses only this, so a supplement is never attached to a pension the user
      // didn't actually estimate as FERS-early with the supplement enabled.
      _pendingSupplement: buildSupplementStream() || undefined,
    });
  };

  const handleSaveClick = () => {
    // Strip transient underscore-prefixed keys before persisting.
    const clean = Object.fromEntries(Object.entries(formData).filter(([k]) => !k.startsWith('_')));
    onSave(clean, formData._pendingSupplement || null);
  };

  const estInput = "w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-slate-100 text-sm focus:border-purple-500/70 focus:outline-none";
  const estLabel = "block text-xs text-slate-400 mb-1";

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`${cardStyle} max-w-lg w-full max-h-[90vh] overflow-y-auto`}>
        <h3 className="text-xl font-bold text-slate-100 mb-6">{editingIncome ? 'Edit Income Stream' : 'Add Income Stream'}</h3>
        <div className="space-y-4">
          <div><label className={labelStyle}>Income Name</label><input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className={inputStyle} /></div>
          <div><label className={labelStyle}>Income Type</label><select value={formData.type} onChange={e => { const v = e.target.value; setFormData({...formData, type: v, ...(v === 'annuity' && !editingIncome ? { cola: 0 } : {})}); }} className={inputStyle}>{INCOME_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
          <div><label className={labelStyle}>Owner</label><select value={formData.owner} onChange={e => setFormData({...formData, owner: e.target.value})} className={inputStyle}><option value="me">Me</option><option value="spouse">Spouse</option>{formData.type !== 'social_security' && <option value="joint">Joint (continues for the survivor)</option>}</select>
            {formData.owner === 'joint' && (
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Household income: it keeps paying after the first death and stops only at the second.
                Start and end ages follow your age. Use this for rental income, a joint-and-survivor
                annuity, a business interest — anything that does not stop because one owner died.
              </p>
            )}</div>

          {formData.type === 'pension' && estAvailable && (
            <div className="border border-purple-700/40 bg-purple-900/10 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setEstOpen(o => !o)}
                className="w-full flex items-center justify-between px-3 py-2 text-left text-sm font-medium text-purple-300 hover:bg-purple-900/20"
              >
                <span>🏛️ Estimate a government pension</span>
                <span className="text-purple-400">{estOpen ? '▲' : '▼'}</span>
              </button>
              {estOpen && (
                <div className="px-3 pb-3 pt-1 space-y-3">
                  <p className="text-[11px] text-slate-400">
                    Estimates a defined-benefit pension: <em>years of service × multiplier × high-3 salary</em>.
                    The result fills the amount, COLA, and start age below. Estimates only — verify against an official calculator.
                  </p>
                  <div>
                    <label className={estLabel}>Retirement system</label>
                    <select value={est.system} onChange={e => setEst({...est, system: e.target.value})} className={estInput}>
                      {Object.entries(GOV_PENSION_SYSTEMS || {}).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={estLabel}>Years of service at retirement</label>
                      <input type="number" min={0} value={est.yearsOfService} onChange={e => setEst({...est, yearsOfService: e.target.value})} className={estInput} />
                    </div>
                    {est.system === 'state' && (
                      <div>
                        <label className={estLabel}>Multiplier (% per year)</label>
                        <input type="number" step="0.1" value={(Number(est.stateMultiplier) * 100).toFixed(1)} onChange={e => setEst({...est, stateMultiplier: (Number(e.target.value) || 0) / 100})} className={estInput} />
                      </div>
                    )}
                  </div>
                  <div>
                    <label className={estLabel}>Salary basis (high-3 average)</label>
                    <div className="flex gap-2 mb-2">
                      <button type="button" onClick={() => setEst({...est, salaryMode: 'project'})} className={`px-2 py-1 text-xs rounded border ${est.salaryMode === 'project' ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' : 'text-slate-400 border-slate-600/50'}`}>From current salary</button>
                      <button type="button" onClick={() => setEst({...est, salaryMode: 'direct'})} className={`px-2 py-1 text-xs rounded border ${est.salaryMode === 'direct' ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' : 'text-slate-400 border-slate-600/50'}`}>I know my high-3</button>
                    </div>
                    {est.salaryMode === 'project' ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={estLabel}>Current salary</label>
                          <input type="number" value={est.currentSalary} onChange={e => setEst({...est, currentSalary: e.target.value})} className={estInput} />
                        </div>
                        <div>
                          <label className={estLabel}>Annual raise (%)</label>
                          <input type="number" step="0.1" value={(Number(est.salaryGrowth) * 100).toFixed(1)} onChange={e => setEst({...est, salaryGrowth: (Number(e.target.value) || 0) / 100})} className={estInput} />
                        </div>
                        <p className="col-span-2 text-[10px] text-slate-500">
                          Projected {yearsUntilRet} yr{yearsUntilRet === 1 ? '' : 's'} to retirement (age {ownerRetAge}), averaging the final 3 years → high-3 ≈ {formatCurrency(estResult ? estResult.high3 : 0)}.
                        </p>
                      </div>
                    ) : (
                      <div>
                        <label className={estLabel}>High-3 average salary (nominal at retirement)</label>
                        <input type="number" value={est.high3Direct} onChange={e => setEst({...est, high3Direct: e.target.value})} className={estInput} />
                      </div>
                    )}
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={est.survivorElection} onChange={e => setEst({...est, survivorElection: e.target.checked})} className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-purple-500" />
                    <span className="text-xs text-slate-300">Elect a 50% survivor annuity (≈10% base reduction)</span>
                  </label>
                  {isFersEarly && (
                    <div className="p-2 bg-slate-800/50 border border-slate-700/50 rounded space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={est.addSupplement} onChange={e => setEst({...est, addSupplement: e.target.checked})} className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-purple-500" />
                        <span className="text-xs text-slate-300">Add the FERS Special Retirement Supplement (bridges to age 62)</span>
                      </label>
                      {est.addSupplement && (
                        <div>
                          <label className={estLabel}>Est. Social Security benefit at 62 (annual)</label>
                          <input type="number" value={est.ssAt62} placeholder={ownerSSStream ? String(ownerSSStream.amount) : '0'} onChange={e => setEst({...est, ssAt62: e.target.value})} className={estInput} />
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            {ownerSSStream && Number(est.ssAt62) <= 0 ? `Defaulting to this owner's SS stream (${formatCurrency(ownerSSStream.amount)}). ` : ''}
                            Supplement ≈ SS-at-62 × years ÷ 40 → {formatCurrency(supplementPreview)}/yr, paid to age 61, no COLA.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3 pt-1 border-t border-purple-700/30">
                    <div className="text-sm">
                      <div className="text-slate-400 text-[11px]">Estimated pension</div>
                      <div className="font-bold text-lg" style={{ color: SERIES.pension }}>{formatCurrency(estResult ? estResult.annualPension : 0)}<span className="text-xs text-slate-500 font-normal">/yr at {ownerRetAge}</span></div>
                      <div className="text-[10px] text-slate-500">
                        {(estResult && estResult.multiplierUsed ? (estResult.multiplierUsed * 100).toFixed(2) : '0')}% × {est.yearsOfService} yr · COLA {(estResult ? (estResult.colaRate * 100).toFixed(1) : '0')}%{estResult && estResult.colaStartAge ? ` from age ${estResult.colaStartAge}` : ''}
                      </div>
                    </div>
                    <button type="button" onClick={applyEstimate} className="px-3 py-2 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded font-medium">Apply estimate</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {formData.type === 'social_security' && <div><label className={labelStyle}>PIA (Monthly)</label><input type="number" value={formData.pia} onChange={e => setFormData({...formData, pia: Number(e.target.value), amount: Number(e.target.value) * 12})} className={inputStyle} /></div>}
          <div><label className={labelStyle}>Annual Amount</label><input type="number" value={formData.amount} onChange={e => setFormData({...formData, amount: Number(e.target.value)})} className={inputStyle} /></div>
          <div>
            <label className={labelStyle}>COLA (%)</label>
            <input type="number" step="0.1" value={(formData.cola * 100).toFixed(1)} onChange={e => setFormData({...formData, cola: Number(e.target.value) / 100})} className={inputStyle} />
            {formData.colaStartAge ? (
              <p className="text-xs text-amber-400/80 mt-1">
                COLA is frozen until age {formData.colaStartAge} (FERS pensions get no COLA before 62).
                {' '}<button type="button" onClick={() => setFormData({...formData, colaStartAge: undefined})} className="underline hover:text-amber-300">Clear</button>
              </p>
            ) : null}
          </div>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!formData.todaysDollars}
              onChange={e => setFormData({...formData, todaysDollars: e.target.checked})}
              className="w-4 h-4 mt-0.5 rounded border-slate-600 bg-slate-800 text-amber-500"
            />
            <span className="text-sm text-slate-300">
              Amount is in today's dollars
              <span className="block text-xs text-slate-500 mt-0.5">
                COLA compounds from today instead of the start age. Check this for amounts quoted in today's
                dollars — like the benefit on your SSA statement or today's market rent — so a stream that
                starts years from now is indexed up to its start. Leave unchecked if the amount is what you'll
                actually receive in the first year (e.g., a fixed pension quote).
              </span>
            </span>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelStyle}>Start Age</label><input type="number" value={formData.startAge} onChange={e => setFormData({...formData, startAge: Number(e.target.value)})} className={inputStyle} /></div>
            <div><label className={labelStyle}>End Age</label><input type="number" value={formData.endAge} onChange={e => setFormData({...formData, endAge: Number(e.target.value)})} className={inputStyle} /></div>
          </div>
          {(() => {
            const ownerRetAge = formData.owner === 'spouse'
              ? (personalInfo.spouseRetirementAge || personalInfo.myRetirementAge)
              : personalInfo.myRetirementAge;
            return (
              <p className="text-xs text-slate-500">
                Both ages are inclusive — the income is received during the start year AND the end year.
                {formData.type === 'earned_income' && ownerRetAge
                  ? ` For a salary, set the end age to the year before ${formData.owner === 'spouse' ? "the spouse's" : 'your'} retirement age (${ownerRetAge}) — i.e. ${ownerRetAge - 1} — so the paycheck stops exactly when retirement starts.`
                  : ''}
              </p>
            );
          })()}
          {/* Shown whether or not survivor modeling is on. The election is a fact
              about the pension, made years before anyone runs a survivor
              projection, and hiding the field until the toggle was flipped meant
              it could not be recorded when it was actually decided. */}
          {formData.type === 'annuity' && (() => {
            const funded = formData.fundedFrom || 'none';
            const buys = funded !== 'none' && (formData.premium || 0) > 0;
            const purchaseAge = formData.purchaseAge || formData.startAge;
            const joint = !!formData.survivorBenefit;
            const rate = annuityPayoutRate({ purchaseAge, startAge: formData.startAge, joint, cola: formData.cola || 0 });
            const estimate = Math.round((formData.premium || 0) * rate);
            const isQlac = buys && funded === 'pretax' && formData.startAge > purchaseAge;
            const overCap = isQlac && formData.premium > QLAC_PREMIUM_LIMIT_2026;
            const lateStart = isQlac && formData.startAge > QLAC_MAX_START_AGE;
            const exRatio = buys && funded !== 'pretax' && formData.amount > 0
              ? annuityExclusionRatio(formData.premium, formData.amount, formData.startAge, joint) : null;
            return (
              <div className="p-3 bg-slate-800/60 border border-slate-700/50 rounded-lg space-y-3">
                <div className="text-sm text-slate-300">The purchase</div>
                <p className="text-xs text-slate-500">
                  Leave the premium at zero for an annuity you already own. Enter a premium and a funding source and
                  the projection <em>buys</em> it: the premium leaves that account type at the purchase age and the
                  payout above starts at the start age.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className={labelStyle}>Premium</label>
                    <input type="number" value={formData.premium || 0} onChange={e => setFormData({ ...formData, premium: Math.max(0, Number(e.target.value) || 0) })} className={inputStyle} />
                  </div>
                  <div>
                    <label className={labelStyle}>Purchase age</label>
                    <input type="number" value={purchaseAge || ''} onChange={e => setFormData({ ...formData, purchaseAge: Number(e.target.value) || undefined })} className={inputStyle} />
                  </div>
                  <div>
                    <label className={labelStyle}>Paid from</label>
                    <select value={funded} onChange={e => setFormData({ ...formData, fundedFrom: e.target.value })} className={inputStyle}>
                      <option value="none">Already owned</option>
                      <option value="pretax">Pre-tax (IRA/401k)</option>
                      <option value="brokerage">Brokerage</option>
                      <option value="roth">Roth</option>
                    </select>
                  </div>
                </div>
                {buys && (
                  <div className="text-xs text-slate-400 space-y-1">
                    <div>
                      A representative quote for this shape — bought at {purchaseAge}, paying from {formData.startAge}
                      {joint ? ', joint life' : ', single life'}{formData.cola > 0 ? `, ${(formData.cola * 100).toFixed(1)}% escalating` : ''} —
                      is about <span className="text-slate-200 font-medium">{(rate * 100).toFixed(1)}%</span> of premium a year:{' '}
                      <span className="text-slate-200 font-medium">{formatCurrency(estimate)}</span>/yr.
                      {' '}<button type="button" onClick={() => setFormData({ ...formData, amount: estimate })} className="text-amber-400 underline decoration-dotted hover:text-amber-300">use it</button>
                      {' '}or enter your insurer's quote above. Priced from this app's life table at a {(ANNUITY_PRICING.rate * 100).toFixed(1)}% rate with a {(ANNUITY_PRICING.load * 100).toFixed(0)}% load — an estimate, not a quote.
                    </div>
                    {funded === 'pretax' && (
                      <div>
                        {isQlac
                          ? <>Pre-tax money with a deferred start makes this a <span className="text-slate-200">QLAC</span>: the premium leaves the RMD base until payments begin, and payments are ordinary income.
                              {overCap && <span className="text-amber-400"> The premium is above the {formatCurrency(QLAC_PREMIUM_LIMIT_2026)} QLAC limit.</span>}
                              {lateStart && <span className="text-amber-400"> A QLAC must start paying by {QLAC_MAX_START_AGE}.</span>}</>
                          : <>Bought from pre-tax money: the rollover is not taxed, and every payment is ordinary income, like a pension.</>}
                      </div>
                    )}
                    {funded === 'brokerage' && (
                      <div>Bought from brokerage: the account's cost basis sets the gain realized in the purchase year.
                        {exRatio !== null && <> About <span className="text-slate-200">{(exRatio * 100).toFixed(0)}%</span> of each payment is a tax-free return of premium until the premium is recovered (Pub 939 exclusion ratio), then payments are fully taxable.</>}</div>
                    )}
                    {funded === 'roth' && (
                      <div>Bought from Roth money: the premium moves tax-free.
                        {exRatio !== null && <> About <span className="text-slate-200">{(exRatio * 100).toFixed(0)}%</span> of each payment is treated as return of premium until it is recovered.</>}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
          {(formData.type === 'pension' || formData.type === 'annuity') && personalInfo.filingStatus === 'married_joint' && (
            <div className="p-3 bg-slate-800/60 border border-slate-700/50 rounded-lg space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.survivorBenefit || false}
                  onChange={e => setFormData({...formData, survivorBenefit: e.target.checked})}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-amber-500"
                />
                <span className="text-sm text-slate-300">Joint &amp; survivor election — continues for the surviving spouse</span>
              </label>
              {formData.survivorBenefit && (
                <div>
                  <label className={labelStyle}>Survivor Benefit Rate</label>
                  {/* The four standard joint-and-survivor forms. 100% is a real
                      election in many public systems — Alabama's RSA among them —
                      and is often only a small reduction to the base benefit,
                      which makes it the one people most often pick and the one a
                      free-text box made easiest to get wrong. */}
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {[
                      { pct: 100, label: '100%', hint: 'Full benefit continues unchanged for the survivor' },
                      { pct: 75, label: '75%' },
                      { pct: 66.67, label: '66⅔%' },
                      { pct: 50, label: '50%', hint: 'The most common default' },
                    ].map(o => {
                      const active = Math.abs((formData.survivorBenefitRate ?? 0.5) * 100 - o.pct) < 0.5;
                      return (
                        <button
                          key={o.pct}
                          type="button"
                          title={o.hint}
                          onClick={() => setFormData({ ...formData, survivorBenefitRate: o.pct / 100 })}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                            active
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                              : 'bg-slate-800 text-slate-400 border-slate-600 hover:text-slate-200 hover:border-slate-500'
                          }`}
                        >{o.label}</button>
                      );
                    })}
                  </div>
                  <input
                    type="number" step="5" min={0} max={100}
                    value={Math.round((formData.survivorBenefitRate ?? 0.5) * 100)}
                    onChange={e => setFormData({...formData, survivorBenefitRate: Number(e.target.value) / 100})}
                    className={inputStyle}
                  />
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    What the survivor keeps. A 100% election pays the same amount for as long as either of
                    you is living — the pension is priced for it, usually as a modest reduction to the base
                    benefit, so enter that reduced amount above rather than the single-life figure.
                    {!personalInfo.survivorModelEnabled && (
                      <> <strong className="text-amber-500/80">Recorded but not yet applied:</strong> turn on
                      survivor modeling in Personal Info to see it in the projection.</>
                    )}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-8">
          <button onClick={onClose} className={buttonSecondary}>Cancel</button>
          <button onClick={handleSaveClick} className={buttonPrimary}>Save Income</button>
        </div>
      </div>
    </div>
  );
}

function AssetModal({ editingAsset, onClose, onSave, defaultSaleAge = 65 }) {
  const [formData, setFormData] = useState(editingAsset || { name: '', type: 'real_estate', value: 0, appreciationRate: 0.03, mortgage: 0, mortgagePayoffAge: null, mortgageRate: 0.065 });
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`${cardStyle} max-w-lg w-full max-h-[90vh] overflow-y-auto`}>
        <h3 className="text-xl font-bold text-slate-100 mb-6">{editingAsset ? 'Edit Asset' : 'Add New Asset'}</h3>
        <div className="space-y-4">
          <div><label className={labelStyle}>Asset Name</label><input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className={inputStyle} placeholder="e.g., Primary Residence, Rental Property" /></div>
          <div><label className={labelStyle}>Asset Type</label><select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className={inputStyle}>{ASSET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelStyle}>Current Value</label><input type="number" value={formData.value} onChange={e => setFormData({...formData, value: Number(e.target.value)})} className={inputStyle} /></div>
            <div><label className={labelStyle}>Annual Appreciation (%)</label><input type="number" step="0.5" value={(formData.appreciationRate * 100).toFixed(1)} onChange={e => setFormData({...formData, appreciationRate: Number(e.target.value) / 100})} className={inputStyle} /><p className="text-xs text-slate-500 mt-1">Use negative for depreciation (e.g., vehicles)</p></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelStyle}>Outstanding Mortgage/Loan</label><input type="number" value={formData.mortgage} onChange={e => setFormData({...formData, mortgage: Number(e.target.value)})} className={inputStyle} /></div>
            <div><label className={labelStyle}>Payoff Age</label><input type="number" value={formData.mortgagePayoffAge || ''} onChange={e => setFormData({...formData, mortgagePayoffAge: e.target.value ? Number(e.target.value) : null})} className={inputStyle} placeholder="Leave blank if no loan" /></div>
          </div>
          {formData.mortgage > 0 && (
            <div>
              <label className={labelStyle}>Mortgage Rate (%)</label>
              <input
                type="number" step="0.125" min="0" max="20"
                value={((formData.mortgageRate ?? 0.065) * 100).toFixed(3)}
                onChange={e => setFormData({...formData, mortgageRate: Number(e.target.value) / 100})}
                className={inputStyle}
              />
              <p className="text-xs text-slate-500 mt-1">Annual interest rate. Used for proper amortization (default 6.5%). Set to 0 for interest-free loans.</p>
            </div>
          )}

          {/* ── Selling this asset ────────────────────────────────────────────
              Downsizing is one of the most common real retirement events and
              the app previously had no way to express it: an asset appreciated
              forever and was never converted to cash. Modelling it needs the
              cost basis, because the taxable gain is sale price less basis less
              selling costs — not the sale price. */}
          <div className="border-t border-slate-700/50 pt-4">
            <label className="flex items-center gap-2 cursor-pointer mb-3">
              <input
                type="checkbox"
                checked={!!formData.saleAge}
                onChange={e => setFormData({ ...formData, saleAge: e.target.checked ? defaultSaleAge : null })}
                className="w-4 h-4 accent-emerald-500"
              />
              <span className="text-sm font-medium text-slate-200">Plan to sell this asset</span>
            </label>
            {!!formData.saleAge && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelStyle}>Sell at Age</label>
                    <input type="number" value={formData.saleAge}
                      onChange={e => setFormData({ ...formData, saleAge: Number(e.target.value) })}
                      className={inputStyle} />
                  </div>
                  <div>
                    <label className={labelStyle}>Selling Costs (%)</label>
                    <input type="number" step="0.5" min="0" max="20"
                      value={((formData.sellingCostPercent ?? 0.06) * 100).toFixed(1)}
                      onChange={e => setFormData({ ...formData, sellingCostPercent: Number(e.target.value) / 100 })}
                      className={inputStyle} />
                    <p className="text-xs text-slate-500 mt-1">Agent commission and closing (default 6%). Reduces the taxable gain.</p>
                  </div>
                </div>
                <div>
                  <label className={labelStyle}>Cost Basis</label>
                  <input type="number" value={formData.costBasis || 0}
                    onChange={e => setFormData({ ...formData, costBasis: Number(e.target.value) })}
                    className={inputStyle} placeholder="What you paid, plus improvements" />
                  <p className="text-xs text-slate-500 mt-1">Purchase price plus capital improvements. Leaving this at $0 treats the entire sale price as gain.</p>
                </div>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!formData.isPrimaryResidence}
                    onChange={e => setFormData({ ...formData, isPrimaryResidence: e.target.checked })}
                    className="w-4 h-4 accent-emerald-500 mt-0.5"
                  />
                  <span className="text-sm text-slate-300">
                    This is my primary residence
                    <span className="block text-xs text-slate-500 mt-0.5">
                      Excludes up to {formatCurrency(SECTION_121_EXCLUSION_JOINT)} of gain if married filing jointly, {formatCurrency(SECTION_121_EXCLUSION_SINGLE)} otherwise (IRC §121).
                      Requires owning and living in it 2 of the last 5 years — the app can’t check that, so only tick it if you qualify.
                    </span>
                  </span>
                </label>
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-8">
          <button onClick={onClose} className={buttonSecondary}>Cancel</button>
          <button onClick={() => onSave(formData)} className={buttonPrimary}>Save Asset</button>
        </div>
      </div>
    </div>
  );
}

function ImportExportModal({ showResetConfirm, setShowResetConfirm, onClose, handleExport, handleImport, handleReset }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`${cardStyle} max-w-md w-full`}>
        <h3 className="text-xl font-bold text-slate-100 mb-6">Import / Export Data</h3>
        <div className="space-y-6">
          <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-700/50">
            <h4 className="text-sm font-medium text-slate-300 mb-2">Export Your Data</h4>
            <p className="text-xs text-slate-500 mb-3">Download your retirement plan as a JSON file for backup or to transfer to another device.</p>
            <button onClick={handleExport} className={buttonPrimary + " w-full"}>
              📥 Download Backup File
            </button>
          </div>

          <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-700/50">
            <h4 className="text-sm font-medium text-slate-300 mb-2">Import Data</h4>
            <p className="text-xs text-slate-500 mb-3">Load a previously exported retirement plan file. This will replace your current data.</p>
            <label className={buttonSecondary + " w-full block text-center cursor-pointer"}>
              📤 Choose File to Import
              <input type="file" accept=".json" onChange={handleImport} className="hidden" />
            </label>
          </div>

          <div className="p-4 bg-red-900/20 rounded-lg border border-red-700/50">
            <h4 className="text-sm font-medium text-red-400 mb-2">Clear My Data</h4>
            <p className="text-xs text-slate-500 mb-3">Remove all your personal data from this browser and reset to sample data.</p>
            {!showResetConfirm ? (
              <button onClick={() => setShowResetConfirm(true)} className="w-full bg-red-600 hover:bg-red-500 text-white font-medium px-4 py-2 rounded-lg transition-all">
                🗑️ Clear All My Data
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-red-300 font-medium">Are you sure? This cannot be undone!</p>
                <div className="flex gap-2">
                  <button onClick={handleReset} className="flex-1 bg-red-600 hover:bg-red-500 text-white font-medium px-4 py-2 rounded-lg transition-all">
                    Yes, Delete Everything
                  </button>
                  <button onClick={() => setShowResetConfirm(false)} className="flex-1 bg-slate-600 hover:bg-slate-500 text-white font-medium px-4 py-2 rounded-lg transition-all">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end mt-6">
          <button onClick={onClose} className={buttonSecondary}>Close</button>
        </div>
      </div>
    </div>
  );
}

