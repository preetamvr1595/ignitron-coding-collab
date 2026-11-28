import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Database,
  Send,
  AlertTriangle,
  Loader2,
  Clock,
  CheckCircle2,
  ChevronLeft,
  Trophy,
  Check,
  Lock,
  PauseCircle,
  ShieldAlert,
  Flag,
  Code2,
  BarChart3,
  CircleDot,
  Flame,
  Table2,
  ArrowRight,
  FolderOpen,
  Info,
  Target,
  Layers,
} from 'lucide-react';

import { useAuth } from '../../context/AuthContext';
import { questionAndArenaService } from '../../services/question-and-arena.service';
import { useCompetitionState, useServerTimer } from '../../hooks/useCompetition';
import { useParticipantMonitoring } from '../../hooks/useParticipantMonitoring';
import { ExamLockOverlay } from '../../components/competition/ExamLockOverlay';
import { Round3DatasetExplorer } from '../../components/competition/Round3DatasetExplorer';
import {
  AnalyticsArenaStateDto,
  AnalyticsQuestionDto,
} from '@ignitron/shared';

// ─────────────────────────────────────────────────────────────────────────────
// Python syntax highlighter
// ─────────────────────────────────────────────────────────────────────────────
function highlightPython(code: string): React.ReactNode {
  if (!code) return null;
  const lines = code.split('\n');
  let key = 0;
  const tokenize = (src: string): React.ReactNode[] => {
    const result: React.ReactNode[] = [];
    const combined =
      /(#[^\n]*)|("""[\s\S]*?"""|'''[\s\S]*?'''|"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*')|\b(def|return|print|for|in|if|elif|else|import|from|as|pass|break|continue|class|lambda|and|or|not|True|False|None|with|yield|raise|try|except|finally|while|del|global|nonlocal|assert|is)\b|\b(len|sum|max|min|sorted|list|dict|set|tuple|int|float|str|bool|range|enumerate|zip|map|filter|round|abs|type|isinstance|hasattr|getattr)\b|\b(\d+\.?\d*)\b/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = combined.exec(src)) !== null) {
      if (m.index > last) result.push(<span key={key++}>{src.slice(last, m.index)}</span>);
      if (m[1]) result.push(<span key={key++} className="text-emerald-400/80 italic">{m[1]}</span>);
      else if (m[2]) result.push(<span key={key++} className="text-amber-300">{m[2]}</span>);
      else if (m[3]) result.push(<span key={key++} className="text-violet-300 font-semibold">{m[3]}</span>);
      else if (m[4]) result.push(<span key={key++} className="text-sky-300">{m[4]}</span>);
      else if (m[5]) result.push(<span key={key++} className="text-orange-300">{m[5]}</span>);
      last = combined.lastIndex;
    }
    if (last < src.length) result.push(<span key={key++}>{src.slice(last)}</span>);
    return result;
  };
  return (
    <>
      {lines.map((line, li) => (
        <span key={li} className="block leading-[1.55]">
          {tokenize(line)}
        </span>
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Nav tab types
// ─────────────────────────────────────────────────────────────────────────────
type NavTab = 'DATASET' | 'CASE_1' | 'CASE_2' | 'CASE_3';

const NAV_TABS: Array<{ id: NavTab; label: string; subtitle: string; num?: string; caseNumber?: 1 | 2 | 3 }> = [
  { id: 'DATASET', label: 'Dataset', subtitle: 'Reference Data' },
  { id: 'CASE_1', label: 'Case 01', subtitle: 'Data Fundamentals', num: '01', caseNumber: 1 },
  { id: 'CASE_2', label: 'Case 02', subtitle: 'Data Integrity', num: '02', caseNumber: 2 },
  { id: 'CASE_3', label: 'Case 03', subtitle: 'Analytical Intelligence', num: '03', caseNumber: 3 },
];

const CASE_DESCRIPTIONS: Record<number, string> = {
  1: "Trace Python snippets to calculate P101's total score and identify the highest-scoring participant.",
  2: 'Trace Python snippets to count accepted submissions and detect duplicate submission IDs.',
  3: 'Trace Python snippets to find the highest-ranked team and apply multi-key team ranking.',
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Page Component
// ─────────────────────────────────────────────────────────────────────────────
export const EventAnalyticsArenaPage: React.FC = () => {
  const { user } = useAuth();
  const teamUser = user?.type === 'TEAM' ? (user as any) : null;
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [arenaState, setArenaState] = useState<AnalyticsArenaStateDto | null>(null);
  const [activeNav, setActiveNav] = useState<NavTab>('CASE_1');
  const [selectedOptions, setSelectedOptions] = useState<Record<string, 'A' | 'B' | 'C' | 'D'>>({});
  const [flaggedQuestions, setFlaggedQuestions] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('ignitron_r3_flagged') || '{}'); } catch { return {}; }
  });
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState<string | null>(null);
  const [submittingCaseNum, setSubmittingCaseNum] = useState<number | null>(null);
  const [caseBanner, setCaseBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showFinalModal, setShowFinalModal] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [showLeaveWarningModal, setShowLeaveWarningModal] = useState(false);
  const [showConcludedModal, setShowConcludedModal] = useState(false);

  // Competition / timer
  const { data: compState } = useCompetitionState();
  const isCompetitionPaused = Boolean(compState?.isPaused || arenaState?.isPaused);
  const isRoundActive = compState?.currentRoundNumber === 3 && compState?.status === 'ROUND_3_ACTIVE';
  const configuredDuration = compState?.rounds?.find((r) => r.roundNumber === 3)?.durationMinutes ?? 60;
  const timer = useServerTimer(
    isRoundActive ? compState?.deadlineAt : null,
    isCompetitionPaused,
    isRoundActive ? (arenaState?.remainingSeconds ?? compState?.remainingDurationSeconds ?? configuredDuration * 60) : configuredDuration * 60,
  );
  const isConcluded = Boolean(
    compState?.status &&
      (['ROUND_3_EVALUATION', 'FINAL_EVALUATION', 'COMPLETED'].includes(compState.status) ||
        (compState.currentRoundNumber && compState.currentRoundNumber > 3)),
  ) || Boolean(timer.isExpired && compState?.deadlineAt);
  const isLocked = isConcluded || Boolean(arenaState?.isSubmitted);

  const { focusWarning, isLockedByProctoring, lockStatus, isDisqualified, lockReason, warningCount, clearWarning, refreshStatus } =
    useParticipantMonitoring({
      roundNumber: 3,
      isRoundActive: Boolean(isRoundActive && !isLocked),
      isSubmitted: Boolean(arenaState?.isSubmitted),
      isConcluded,
      isReady: !isLoading && Boolean(arenaState),
      arenaType: 'ANALYTICS',
    });

  useEffect(() => { if (timer.isExpired && !arenaState?.isSubmitted) setShowConcludedModal(true); }, [timer.isExpired, arenaState?.isSubmitted]);

  // Fetch arena state
  const fetchArenaState = useCallback(async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const state = await questionAndArenaService.getAnalyticsArenaState();
      setArenaState(state);
      const initialOpts: Record<string, 'A' | 'B' | 'C' | 'D'> = {};
      for (const c of state.cases) {
        for (const q of c.questions) {
          if (q.selectedOption && ['A', 'B', 'C', 'D'].includes(q.selectedOption)) {
            initialOpts[q.id] = q.selectedOption as 'A' | 'B' | 'C' | 'D';
          }
        }
      }
      setSelectedOptions(initialOpts);
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.message || err?.message || 'Failed to load Round 3.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchArenaState(); }, [fetchArenaState]);

  // Computed
  const activeCase = useMemo(() => {
    if (!arenaState || activeNav === 'DATASET') return null;
    const caseNum = NAV_TABS.find((t) => t.id === activeNav)?.caseNumber;
    return arenaState.cases.find((c) => c.caseNumber === caseNum) ?? null;
  }, [arenaState, activeNav]);

  const totalQuestionsCount = useMemo(
    () => arenaState?.cases.reduce((acc, c) => acc + c.questions.length, 0) ?? 6,
    [arenaState],
  );

  const answeredCount = useMemo(() => {
    if (!arenaState) return 0;
    return arenaState.cases
      .flatMap((c) => c.questions)
      .filter((q) => Boolean(selectedOptions[q.id])).length;
  }, [arenaState, selectedOptions]);

  const caseProgress = useMemo(() => {
    if (!arenaState) {
      return {
        1: { answered: 0, total: 2, submitted: false },
        2: { answered: 0, total: 2, submitted: false },
        3: { answered: 0, total: 2, submitted: false },
      };
    }
    const result: Record<number, { answered: number; total: number; submitted: boolean }> = {};
    for (const c of arenaState.cases) {
      result[c.caseNumber] = {
        answered: c.questions.filter((q) => Boolean(selectedOptions[q.id])).length,
        total: c.questions.length,
        submitted: c.questions.length > 0 && c.questions.every((q) => q.isSubmitted),
      };
    }
    return result;
  }, [arenaState, selectedOptions]);

  // Handlers
  const handleSelectNav = useCallback((tabId: NavTab) => {
    setActiveNav(tabId);
    setCaseBanner(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleSelectOption = useCallback(async (q: AnalyticsQuestionDto, optKey: 'A' | 'B' | 'C' | 'D') => {
    if (q.isSubmitted || isLocked || isCompetitionPaused || isLockedByProctoring) return;
    setSelectedOptions((prev) => ({ ...prev, [q.id]: optKey }));
    setSavingQuestionId(q.id);
    setSavedToast(null);
    try {
      await questionAndArenaService.selectAnalyticsOption(q.id, optKey);
      setSavedToast(`Q${q.orderNumber} saved`);
      setTimeout(() => setSavedToast(null), 2200);
    } catch {}
    finally { setSavingQuestionId(null); }
  }, [isLocked, isCompetitionPaused, isLockedByProctoring]);

  const handleSubmitCase = useCallback(async () => {
    if (!activeCase) return;
    setSubmittingCaseNum(activeCase.caseNumber);
    setCaseBanner(null);
    try {
      await questionAndArenaService.submitAnalyticsCase(
        activeCase.caseNumber as 1 | 2 | 3,
        activeCase.questions.map((q) => ({
          questionId: q.id,
          selectedOption: (selectedOptions[q.id] || 'A') as 'A' | 'B' | 'C' | 'D',
        })),
      );
      setCaseBanner({ type: 'success', message: `Case 0${activeCase.caseNumber} submitted and locked successfully.` });
      await fetchArenaState();
    } catch (err: any) {
      setCaseBanner({ type: 'error', message: err?.response?.data?.message || 'Failed to submit case.' });
    } finally {
      setSubmittingCaseNum(null);
    }
  }, [activeCase, selectedOptions, fetchArenaState]);

  const handleFinalSubmit = useCallback(async () => {
    setIsFinalizing(true);
    try {
      await questionAndArenaService.finalizeRound3();
      setShowFinalModal(false);
      await fetchArenaState();
    } catch (err: any) {
      setCaseBanner({ type: 'error', message: err?.response?.data?.message || 'Failed to finalize round.' });
      setShowFinalModal(false);
    } finally { setIsFinalizing(false); }
  }, [fetchArenaState]);

  const toggleFlagQuestion = (questionId: string) => {
    setFlaggedQuestions((prev) => {
      const next = { ...prev, [questionId]: !prev[questionId] };
      try { localStorage.setItem('ignitron_r3_flagged', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const handleBackToDashboard = () => {
    if (!isLocked && !isConcluded && !timer.isExpired && isRoundActive) {
      setShowLeaveWarningModal(true);
    } else {
      navigate('/team/dashboard');
    }
  };

  const isActiveCaseSubmitted = activeCase ? activeCase.questions.length > 0 && activeCase.questions.every((q) => q.isSubmitted) : false;
  const isActiveCaseReadyToSubmit = activeCase
    ? activeCase.questions.length > 0 &&
      activeCase.questions.every((q) => Boolean(selectedOptions[q.id])) &&
      !isActiveCaseSubmitted &&
      !isLocked &&
      !isCompetitionPaused &&
      !isLockedByProctoring
    : false;

  const allCasesSubmitted = [1, 2, 3].every((cn) => caseProgress[cn]?.submitted);

  // ─────────────────────── RENDER STATES ───────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#020b06] flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="relative mx-auto w-14 h-14">
            <div className="absolute inset-0 rounded-full border-2 border-emerald-500/20" />
            <div className="absolute inset-0 rounded-full border-t-2 border-emerald-400 animate-spin" />
            <Code2 className="absolute inset-0 m-auto w-6 h-6 text-emerald-400" />
          </div>
          <p className="text-xs font-mono tracking-wide text-emerald-300/75">Loading Python Code Tracing Challenge…</p>
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="min-h-screen bg-[#020b06] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl bg-rose-950/60 border border-rose-500/40 p-6 text-center space-y-4">
          <AlertTriangle className="mx-auto w-10 h-10 text-rose-400" />
          <p className="text-sm text-rose-200">{errorMessage}</p>
          <button onClick={fetchArenaState} className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 font-bold text-sm cursor-pointer">
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────── MAIN RENDER ───────────────────────
  const progressPct = totalQuestionsCount > 0 ? (answeredCount / totalQuestionsCount) * 100 : 0;
  const activeCaseAnsweredCount = activeCase
    ? activeCase.questions.filter((q) => Boolean(selectedOptions[q.id])).length
    : 0;
  const activeCaseTotalCount = activeCase ? activeCase.questions.length : 2;
  const activeCasePct = activeCaseTotalCount > 0 ? (activeCaseAnsweredCount / activeCaseTotalCount) * 100 : 0;

  return (
    <div
      className="min-h-screen bg-[#020b06] text-slate-100 flex flex-col selection:bg-emerald-500/30 overflow-x-hidden"
      style={{
        fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
        backgroundImage:
          'radial-gradient(ellipse 90% 45% at 50% 0%, rgba(16, 185, 129, 0.10), transparent 70%), radial-gradient(ellipse 60% 35% at 15% 100%, rgba(16, 185, 129, 0.06), transparent 70%)',
      }}
    >
      <ExamLockOverlay
        isOpen={Boolean(isLockedByProctoring)}
        lockStatus={lockStatus}
        isDisqualified={isDisqualified}
        lockReason={lockReason}
        warningCount={warningCount}
        onRefreshStatus={refreshStatus}
        onReturnToDashboard={() => navigate('/team/dashboard')}
      />

      {/* ═══════════════════════════ TOP HEADER ═══════════════════════════ */}
      <header className="sticky top-0 z-40 bg-[#020d07]/95 backdrop-blur-xl border-b border-emerald-900/50">
        <div className="max-w-[1440px] mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2 sm:gap-4">
          {/* Left: Back + Brand */}
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={handleBackToDashboard}
              title="Back to Dashboard"
              className="p-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-800/50 text-emerald-300 transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/35 flex items-center justify-center shadow-[0_0_12px_rgba(245,158,11,0.15)]">
                <Flame className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <div className="text-xs font-black tracking-wider text-white uppercase leading-none">IGNITRON 2K26</div>
                <div className="text-[9px] text-emerald-400/70 font-mono tracking-widest leading-none mt-0.5">CODING COLLAB</div>
              </div>
            </div>
          </div>

          {/* Center: Round Status Pills */}
          <div className="hidden lg:flex items-center gap-2">
            {['Round 1', 'Round 2'].map((r) => (
              <span
                key={r}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#04180d] border border-emerald-900/60 text-slate-300 text-xs font-medium cursor-default"
              >
                <span>{r}</span>
                <Check className="w-3 h-3 text-emerald-400" />
              </span>
            ))}
            <span className="flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/60 text-emerald-200 text-xs font-bold shadow-[0_0_16px_rgba(16,185,129,0.22)]">
              <Flame className="w-3 h-3 text-amber-400" />
              <span>Round 3</span>
            </span>
          </div>

          {/* Right: Team + Gold-bordered Countdown Timer */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {teamUser && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#04180d] border border-emerald-900/60 text-xs text-slate-200 font-semibold max-w-[170px] truncate">
                <CircleDot className="w-3 h-3 text-sky-400 shrink-0" />
                <span className="truncate">Team: {teamUser.teamName || 'Team'}</span>
              </div>
            )}
            <div
              className={`flex items-center gap-2 px-3 sm:px-3.5 py-1 rounded-full border text-xs font-mono ${
                timer.secondsLeft > 0 && timer.secondsLeft <= 300
                  ? 'bg-rose-950/70 border-rose-500/60 text-rose-300 animate-pulse'
                  : 'bg-[#08150b] border-amber-500/50 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.12)]'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <div className="leading-tight">
                <div className="text-[8px] uppercase tracking-widest text-amber-300/75 hidden sm:block">TIME LEFT</div>
                <div className="text-xs sm:text-sm font-black tracking-wider text-white">
                  {timer.formatted.replace(':', ' : ')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════ ROUND BANNER ═══════════════════════════ */}
      <section className="max-w-[1440px] w-full mx-auto px-3 sm:px-6 pt-4">
        <div className="rounded-2xl bg-gradient-to-r from-[#03140b]/95 via-[#051d10]/90 to-[#03140b]/95 border border-emerald-900/55 px-4 sm:px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-3.5 sm:gap-4">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#041b0f] border border-emerald-500/35 flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.15)] shrink-0">
              <Code2 className="w-6 h-6 sm:w-7 sm:h-7 text-amber-400" />
            </div>
            <div>
              <div className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-amber-400">
                ROUND 3
              </div>
              <h1 className="text-lg sm:text-2xl font-black text-white tracking-tight leading-snug">
                Python Code <span className="text-emerald-400">Tracing Challenge</span>
              </h1>
              <p className="text-xs text-slate-300/85 mt-0.5">
                Read the Python snippets and choose the option where both the code and its output are correct.
              </p>
            </div>
          </div>

          {/* Unified 3-column Stats Pill */}
          <div className="grid grid-cols-3 rounded-xl bg-[#021008]/90 border border-amber-500/30 divide-x divide-emerald-900/60 shrink-0 self-start md:self-auto">
            <div className="px-4 py-2 text-center">
              <Code2 className="w-3.5 h-3.5 text-amber-400 mx-auto mb-0.5" />
              <div className="text-sm font-black text-white leading-tight">{totalQuestionsCount}</div>
              <div className="text-[10px] text-slate-400">Questions</div>
            </div>
            <div className="px-4 py-2 text-center">
              <Trophy className="w-3.5 h-3.5 text-amber-400 mx-auto mb-0.5" />
              <div className="text-sm font-black text-white leading-tight">1 Mark</div>
              <div className="text-[10px] text-slate-400">Each</div>
            </div>
            <div className="px-4 py-2 text-center">
              <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 mx-auto mb-0.5" />
              <div className="text-sm font-black text-white leading-tight">6 Marks</div>
              <div className="text-[10px] text-slate-400">Total</div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════ 4-CARD NAV TABS ═══════════════════════════ */}
      <nav className="max-w-[1440px] w-full mx-auto px-3 sm:px-6 pt-3">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          {NAV_TABS.map((tab) => {
            const isActive = activeNav === tab.id;
            const cp = tab.caseNumber ? caseProgress[tab.caseNumber] : null;
            const submitted = cp?.submitted;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleSelectNav(tab.id)}
                className={`flex items-center gap-3 px-3.5 sm:px-4 py-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  isActive
                    ? 'bg-emerald-500/15 border-emerald-400/70 shadow-[0_0_20px_rgba(16,185,129,0.2)] text-white'
                    : 'bg-[#03130a]/90 border-emerald-900/50 hover:border-emerald-600/50 hover:bg-[#04190e] text-slate-300'
                }`}
              >
                {tab.id === 'DATASET' ? (
                  <span
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${
                      isActive
                        ? 'bg-emerald-400/20 border-emerald-400/60 text-emerald-300'
                        : 'bg-[#020c06] border-emerald-900/60 text-emerald-400'
                    }`}
                  >
                    <Database className="w-3.5 h-3.5" />
                  </span>
                ) : (
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black shrink-0 border ${
                      isActive
                        ? 'bg-emerald-400 text-slate-950 border-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.5)]'
                        : submitted
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                        : 'bg-[#041a0e] text-emerald-300/80 border-emerald-800/70'
                    }`}
                  >
                    {submitted ? <Check className="w-3.5 h-3.5 stroke-[2.5]" /> : tab.num}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-xs sm:text-[13px] font-bold truncate">{tab.label}</div>
                  <div className={`text-[10px] truncate ${isActive ? 'text-emerald-200/85' : 'text-slate-400'}`}>
                    {tab.subtitle}
                  </div>
                </div>
                {cp && !submitted && (
                  <span className="hidden sm:inline-flex px-1.5 py-0.5 rounded bg-[#020c06] border border-emerald-900/60 text-emerald-300/90 text-[10px] font-mono shrink-0">
                    {cp.answered}/{cp.total}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* ═══════════════════════════ ALERTS / BANNERS ═══════════════════════════ */}
      {(focusWarning || isCompetitionPaused || arenaState?.isSubmitted || caseBanner) && (
        <div className="max-w-[1440px] w-full mx-auto px-3 sm:px-6 pt-3 space-y-2">
          {focusWarning && (
            <div className="p-3 rounded-xl bg-amber-950/70 border border-amber-500/50 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-amber-200">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{focusWarning.message}</span>
              </div>
              <button
                type="button"
                onClick={clearWarning}
                className="px-2.5 py-1 rounded bg-amber-500/20 text-amber-200 font-mono text-[11px] cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}
          {isCompetitionPaused && (
            <div className="p-3 rounded-xl bg-amber-950/60 border border-amber-500/40 flex items-center gap-2.5 text-xs text-amber-200">
              <PauseCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Round 3 is currently paused by administrators. Inputs are temporarily locked.</span>
            </div>
          )}
          {arenaState?.isSubmitted && (
            <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/40 flex items-center gap-2.5 text-xs text-emerald-200">
              <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Round 3 has been officially finalized and submitted. Your answers are locked and preserved.</span>
            </div>
          )}
          {caseBanner && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                caseBanner.type === 'success'
                  ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200'
                  : 'bg-rose-950/80 border-rose-500/50 text-rose-200'
              }`}
            >
              <div className="flex items-center gap-2">
                {caseBanner.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span>{caseBanner.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setCaseBanner(null)}
                className="text-[11px] font-mono opacity-75 hover:opacity-100 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════ MAIN WORKSPACE ═══════════════════════════ */}
      {activeNav === 'DATASET' ? (
        <main key="DATASET" className="max-w-[1440px] w-full mx-auto px-3 sm:px-6 py-4 flex-1">
          <Round3DatasetExplorer />
        </main>
      ) : (
      <div className="max-w-[1440px] w-full mx-auto px-3 sm:px-6 py-4 flex flex-col lg:flex-row gap-4 flex-1 items-start">

        {/* ─────── LEFT SIDEBAR ─────── */}
        <aside className="w-full lg:w-[250px] xl:w-[264px] shrink-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
          {/* Round Progress */}
          <div className="rounded-2xl bg-[#03130a]/90 border border-emerald-900/55 p-4 space-y-3.5 shadow-lg">
            <div className="text-xs font-bold text-slate-100 flex items-center gap-2">
              <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Round Progress</span>
            </div>

            {/* Centered Large Circular Progress Ring */}
            <div className="flex justify-center py-1">
              <div className="relative w-28 h-28">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 112 112">
                  <circle cx="56" cy="56" r="46" fill="none" stroke="rgba(16,185,129,0.12)" strokeWidth="9" />
                  <circle
                    cx="56"
                    cy="56"
                    r="46"
                    fill="none"
                    stroke="url(#r3RingGrad)"
                    strokeWidth="9"
                    strokeLinecap="round"
                    strokeDasharray={`${(progressPct / 100) * 289.03} 289.03`}
                    style={{ transition: 'stroke-dasharray 0.4s ease' }}
                  />
                  <defs>
                    <linearGradient id="r3RingGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#34d399" />
                      <stop offset="100%" stopColor="#10b981" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-black text-white leading-none">
                    {answeredCount}/{totalQuestionsCount}
                  </span>
                  <span className="text-[11px] text-slate-400 mt-1">Answered</span>
                </div>
              </div>
            </div>

            {/* Compact Case Progress Rows */}
            <div className="space-y-1.5">
              {[1, 2, 3].map((cn) => {
                const cp = caseProgress[cn] ?? { answered: 0, total: 2, submitted: false };
                const isSelectedTab = activeNav === `CASE_${cn}`;
                return (
                  <button
                    key={cn}
                    type="button"
                    onClick={() => handleSelectNav(`CASE_${cn}` as NavTab)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border transition cursor-pointer ${
                      isSelectedTab
                        ? 'bg-emerald-500/12 border-emerald-400/60 text-white'
                        : 'bg-[#020d07]/80 border-emerald-900/45 hover:border-emerald-600/40 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                          cp.submitted
                            ? 'border-emerald-400 bg-emerald-500/25 text-emerald-300'
                            : isSelectedTab
                            ? 'border-emerald-400'
                            : 'border-slate-600'
                        }`}
                      >
                        {cp.submitted && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                      </span>
                      <span className="text-xs font-semibold">Case 0{cn}</span>
                    </div>
                    <span className="text-xs font-mono text-slate-300">
                      {cp.answered}/{cp.total}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Instructions */}
          <div className="rounded-2xl bg-[#03130a]/90 border border-emerald-900/55 p-4 space-y-3 shadow-lg">
            <div className="text-xs font-bold text-slate-100 flex items-center gap-2">
              <Info className="w-3.5 h-3.5 text-emerald-400" />
              <span>Instructions</span>
            </div>
            <ul className="space-y-2">
              {[
                'Read each Python code snippet carefully.',
                'Select the option where both the code and its output are correct.',
                'Only one option is correct per question.',
                'No compiler or code execution is required.',
                'Each question has one mark.',
              ].map((text, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-slate-300 leading-snug">
                  <span className="w-4 h-4 rounded bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-2.5 h-2.5 text-emerald-400 stroke-[3]" />
                  </span>
                  <span>{text}</span>
                </li>
              ))}
            </ul>
            <div className="pt-2.5 border-t border-emerald-900/45 flex items-center gap-2 text-xs font-bold text-amber-300">
              <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Total: 6 Marks</span>
            </div>
          </div>
        </aside>

        {/* ─────── MAIN PANEL ─────── */}
        <main key={activeNav} className="flex-1 min-w-0 w-full space-y-4">

          {/* ═══ CASE VIEW (EXACTLY 2 QUESTIONS PER CASE) ═══ */}
          {activeCase && (
            <section className="space-y-4">
              {/* Case Header Banner */}
              <div className="rounded-2xl bg-[#03130a]/90 border border-emerald-900/55 px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/12 border border-amber-500/35 flex items-center justify-center shrink-0">
                    <FolderOpen className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
                      {activeCase.caseTitle || `Case 0${activeCase.caseNumber}`}
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {activeCase.caseDescription || CASE_DESCRIPTIONS[activeCase.caseNumber]}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  {savedToast && (
                    <span className="text-[11px] font-mono text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 rounded-lg">
                      {savedToast}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#0a170c] border border-amber-500/40 text-amber-300 text-xs font-bold">
                    <Layers className="w-3.5 h-3.5 text-amber-400" />
                    <span>{activeCase.questions.length} Questions</span>
                    <span className="text-amber-500/50">|</span>
                    <span>{activeCase.totalMarks ?? 2} Marks</span>
                  </span>
                  {isActiveCaseSubmitted && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-emerald-500/20 border border-emerald-400/50 text-emerald-200 text-xs font-bold">
                      <Lock className="w-3 h-3" /> Submitted
                    </span>
                  )}
                </div>
              </div>

              {/* Exactly 2 Question Cards */}
              <div className="space-y-4">
                {activeCase.questions.map((q) => {
                  const chosen = selectedOptions[q.id] || null;
                  const options = q.options && q.options.length > 0
                    ? q.options
                    : [
                        { key: 'A' as const, label: 'Option A', code: '' },
                        { key: 'B' as const, label: 'Option B', code: '' },
                        { key: 'C' as const, label: 'Option C', code: '' },
                        { key: 'D' as const, label: 'Option D', code: '' },
                      ];
                  const hasFixture = Array.isArray(q.fixtureTable) && q.fixtureTable.length > 0;
                  const fixtureCols = hasFixture ? Object.keys(q.fixtureTable![0]) : [];

                  return (
                    <article
                      key={q.id}
                      id={`r3-q-${q.orderNumber}`}
                      className="rounded-2xl bg-[#03130a]/95 border border-emerald-900/55 overflow-hidden shadow-xl"
                    >
                      {/* Question Header */}
                      <div className="px-4 sm:px-5 py-3 bg-[#04190e]/75 border-b border-emerald-900/45 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 sm:gap-3">
                          <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-mono font-black text-xs">
                            Q{q.orderNumber}
                          </span>
                          <h3 className="text-sm sm:text-[15px] font-bold text-white">{q.title}</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleFlagQuestion(q.id)}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition cursor-pointer ${
                              flaggedQuestions[q.id]
                                ? 'bg-amber-500/20 border-amber-400/60 text-amber-300'
                                : 'bg-[#020d07] border-emerald-900/60 text-slate-300 hover:border-amber-400/50 hover:text-amber-300'
                            }`}
                          >
                            <Flag className={`w-3 h-3 ${flaggedQuestions[q.id] ? 'fill-amber-400' : ''}`} />
                            <span>{flaggedQuestions[q.id] ? 'Flagged' : 'Flag'}</span>
                          </button>

                          <span className="px-2.5 py-1 rounded-lg bg-[#0d190b] border border-amber-500/40 text-amber-300 font-mono text-[11px] font-bold">
                            {q.marks ?? 1} Mark
                          </span>

                          {q.isSubmitted ? (
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 font-mono text-[11px] font-bold flex items-center gap-1">
                              <Lock className="w-3 h-3" /> Submitted
                            </span>
                          ) : savingQuestionId === q.id ? (
                            <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 font-mono text-[11px] flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" /> Saving…
                            </span>
                          ) : chosen ? (
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-950 border border-emerald-700/60 text-emerald-300 font-mono text-[11px]">
                              Saved ({chosen})
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {/* Problem Statement + Structured Reference Data Panel */}
                      <div className="px-4 sm:px-5 pt-4 pb-3 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                        <div className={hasFixture ? 'lg:col-span-5' : 'lg:col-span-12'}>
                          <p className="text-xs sm:text-[13px] text-slate-200 leading-relaxed whitespace-pre-line">
                            {q.description || ''}
                          </p>
                        </div>

                        {hasFixture && (
                          <div className="lg:col-span-7 rounded-xl bg-[#020b06] border border-emerald-900/55 overflow-hidden">
                            <div className="px-3 py-1.5 bg-[#04180d] border-b border-emerald-900/45 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-emerald-300/85">
                              <Table2 className="w-3 h-3 text-emerald-400 shrink-0" />
                              <span className="truncate">{q.fixtureDescription || 'Reference Data'}</span>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-emerald-900/35">
                                    {fixtureCols.map((col) => (
                                      <th
                                        key={col}
                                        className="px-3 py-1.5 text-left font-mono text-[10px] font-bold uppercase text-slate-400 whitespace-nowrap"
                                      >
                                        {col}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {q.fixtureTable!.map((row, ri) => (
                                    <tr key={ri} className="border-b border-emerald-950/40 last:border-b-0">
                                      {fixtureCols.map((col) => (
                                        <td key={col} className="px-3 py-1.5 font-mono text-xs text-slate-100 whitespace-nowrap">
                                          {String(row[col] ?? '')}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 2×2 Balanced Option Grid */}
                      <div className="px-4 sm:px-5 pb-4 sm:pb-5 grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch">
                        {options.map((opt) => {
                          const isSelected = chosen === opt.key;
                          const disabled = q.isSubmitted || isLocked || isCompetitionPaused || isLockedByProctoring;
                          return (
                            <button
                              key={opt.key}
                              type="button"
                              disabled={disabled}
                              onClick={() => handleSelectOption(q, opt.key)}
                              aria-pressed={isSelected}
                              className={`group text-left rounded-xl border px-3.5 py-3 transition-all flex items-start gap-3 ${
                                disabled ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'
                              } ${
                                isSelected
                                  ? 'bg-emerald-500/[0.09] border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.22)]'
                                  : 'bg-[#020c06]/90 border-emerald-900/55 hover:border-emerald-500/45 hover:bg-emerald-950/25'
                              }`}
                            >
                              {/* Radio + Letter Label */}
                              <div className="flex items-center gap-2 shrink-0 pt-0.5">
                                <span
                                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition ${
                                    isSelected
                                      ? 'border-emerald-400 bg-emerald-400/20 shadow-[0_0_8px_rgba(52,211,153,0.6)]'
                                      : 'border-slate-600 group-hover:border-emerald-500/60'
                                  }`}
                                >
                                  {isSelected && <span className="w-2 h-2 rounded-full bg-emerald-400" />}
                                </span>
                                <span
                                  className={`font-mono text-xs font-black ${
                                    isSelected ? 'text-emerald-300' : 'text-slate-200'
                                  }`}
                                >
                                  {opt.key}
                                </span>
                              </div>

                              {/* Syntax-Highlighted Python Code Block */}
                              <pre className="min-w-0 flex-1 font-mono text-[11.5px] sm:text-xs text-slate-100 whitespace-pre-wrap break-words overflow-x-auto">
                                {highlightPython(opt.code || opt.label || '')}
                              </pre>
                            </button>
                          );
                        })}
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* Clean In-Flow Bottom Case Progress Footer */}
              <div className="rounded-2xl bg-[#03130a]/95 border border-emerald-900/55 px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Target className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div className="text-xs font-semibold text-slate-200 whitespace-nowrap">
                    Case 0{activeCase.caseNumber} Progress:{' '}
                    <span className="font-mono text-emerald-300">
                      {activeCaseAnsweredCount} / {activeCaseTotalCount} Answered
                    </span>
                  </div>
                  <div className="hidden md:block flex-1 max-w-xs h-2 rounded-full bg-[#020b06] border border-emerald-900/50 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-300"
                      style={{ width: `${activeCasePct}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0 flex-wrap sm:flex-nowrap">
                  {activeCase.caseNumber < 3 && (
                    <button
                      type="button"
                      onClick={() => handleSelectNav(`CASE_${activeCase.caseNumber + 1}` as NavTab)}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#04180d] hover:bg-[#062213] border border-emerald-800/60 text-slate-200 text-xs font-semibold transition cursor-pointer flex-1 sm:flex-initial"
                    >
                      <span>Next Case</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={!isActiveCaseReadyToSubmit || submittingCaseNum === activeCase.caseNumber}
                    onClick={handleSubmitCase}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 disabled:from-emerald-950 disabled:to-emerald-950 disabled:border disabled:border-emerald-900/50 text-slate-950 disabled:text-emerald-500/50 font-bold text-xs shadow-[0_0_16px_rgba(16,185,129,0.25)] disabled:shadow-none disabled:cursor-not-allowed transition cursor-pointer flex-1 sm:flex-initial"
                  >
                    {submittingCaseNum === activeCase.caseNumber ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Submitting…</span>
                      </>
                    ) : isActiveCaseSubmitted ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Case 0{activeCase.caseNumber} Submitted</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Submit Case 0{activeCase.caseNumber}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Finalize Round 3 Card (appears once all 3 cases are submitted) */}
              {allCasesSubmitted && !arenaState?.isSubmitted && !isLocked && (
                <div className="rounded-2xl bg-gradient-to-r from-emerald-950/85 to-teal-950/85 border border-emerald-500/50 p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-[0_0_28px_rgba(16,185,129,0.12)]">
                  <div>
                    <div className="text-sm font-bold text-emerald-200 flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-amber-400" /> All 3 Cases Submitted
                    </div>
                    <div className="text-xs text-slate-300 mt-0.5">
                      Finalize Round 3 to lock your submission and record your server-calculated score.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowFinalModal(true)}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 transition cursor-pointer shrink-0"
                  >
                    <Trophy className="w-4 h-4" /> Finalize Round 3
                  </button>
                </div>
              )}
            </section>
          )}
        </main>
      </div>
      )}

      {/* ═══════════════════════════ MODALS ═══════════════════════════ */}
      {showFinalModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl bg-[#031409] border border-emerald-500/50 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
                <Trophy className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Finalize Round 3?</h3>
                <p className="text-xs text-slate-400">This action cannot be undone.</p>
              </div>
            </div>
            <div className="rounded-xl bg-amber-950/40 border border-amber-500/30 p-3 text-xs text-amber-200 space-y-1">
              <p className="font-semibold">Confirmation</p>
              <p>Finalizing will permanently lock your Round 3 answers. Your score will be calculated on the server.</p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowFinalModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-sm font-semibold cursor-pointer hover:bg-slate-700 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={isFinalizing}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 text-sm font-black cursor-pointer disabled:opacity-50 hover:from-emerald-400 hover:to-teal-400 transition"
              >
                {isFinalizing ? <Loader2 className="inline w-4 h-4 animate-spin" /> : 'Confirm Finalize'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showLeaveWarningModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-sm w-full rounded-2xl bg-[#031409] border border-amber-500/40 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-white">Leave Round 3?</h3>
                <p className="text-xs text-slate-400">Your progress is auto-saved. You can return while the round is active.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowLeaveWarningModal(false)}
                className="flex-1 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Stay
              </button>
              <button
                type="button"
                onClick={() => navigate('/team/dashboard')}
                className="flex-1 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-black cursor-pointer"
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}

      {showConcludedModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-sm w-full rounded-2xl bg-[#031409] border border-emerald-500/40 p-5 space-y-4 shadow-2xl text-center">
            <Clock className="mx-auto w-10 h-10 text-emerald-400" />
            <h3 className="text-base font-bold text-white">Time&apos;s Up!</h3>
            <p className="text-xs text-slate-400">Round 3 has concluded. Your answers have been recorded.</p>
            <button
              type="button"
              onClick={() => {
                setShowConcludedModal(false);
                navigate('/team/dashboard');
              }}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-sm cursor-pointer"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
