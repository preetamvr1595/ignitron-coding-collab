import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bug,
  Code2,
  Play,
  Send,
  AlertTriangle,
  Loader2,
  Terminal,
  ChevronLeft,
  Clock,
  PauseCircle,
  ShieldAlert,
  CheckCircle2,
  Lock,
  Unlock,
  Crosshair,
  Award,
  FileCheck,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { oneDark } from '@codemirror/theme-one-dark';

import { useAuth } from '../../context/AuthContext';
import { questionAndArenaService } from '../../services/question-and-arena.service';
import { useCompetitionState, useServerTimer } from '../../hooks/useCompetition';
import { useParticipantMonitoring } from '../../hooks/useParticipantMonitoring';
import { ExamLockOverlay } from '../../components/competition/ExamLockOverlay';
import {
  BugHuntArenaStateDto,
  BugHuntIdentifiedBugDto,
  BugHuntTestRunResultDto,
  BugHuntLanguageCode,
} from '@ignitron/shared';

// Custom dark theme extension matching IGNITRON emerald/slate UI styling
const customDarkTheme = EditorView.theme({
  '&': {
    height: '100%',
    maxHeight: '100%',
    backgroundColor: '#020b06',
    fontSize: '13px',
  },
  '.cm-scroller': {
    overflow: 'auto !important',
    fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
    lineHeight: '1.6',
  },
  '.cm-content': {
    paddingBottom: '50px',
  },
  '.cm-gutters': {
    backgroundColor: '#010804',
    color: '#059669',
    borderRight: '1px solid rgba(16, 185, 129, 0.2)',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    color: '#34d399',
  },
  '.cm-selectionMatch': {
    backgroundColor: 'rgba(16, 185, 129, 0.25)',
  },
  '&.cm-focused .cm-cursor': {
    borderLeftColor: '#10b981',
  },
});

export const BugHuntArenaPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Authoritative Competition State & Timer
  const { data: compState } = useCompetitionState();
  const isCompetitionPaused = Boolean(compState?.isPaused);
  const isRoundActive =
    compState?.currentRoundNumber === 2 && compState?.status === 'ROUND_2_ACTIVE';
  const configuredDuration =
    compState?.rounds?.find((r) => r.roundNumber === 2)?.durationMinutes ?? 40;

  const timer = useServerTimer(
    isRoundActive ? compState?.deadlineAt : null,
    isCompetitionPaused,
    isRoundActive ? compState?.remainingDurationSeconds : configuredDuration * 60,
  );

  // Arena & Question Data State
  const [arenaState, setArenaState] = useState<BugHuntArenaStateDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<'investigation' | 'repair' | 'results'>('investigation');

  const [showLeaveWarningModal, setShowLeaveWarningModal] = useState(false);
  const [showConcludedModal, setShowConcludedModal] = useState(false);

  const isConcluded =
    Boolean(
      compState?.status &&
        (['ROUND_2_EVALUATION', 'ROUND_3_ACTIVE', 'ROUND_3_EVALUATION', 'FINAL_EVALUATION', 'COMPLETED'].includes(compState.status) ||
          (compState.currentRoundNumber && compState.currentRoundNumber > 2)),
    ) || Boolean(timer.isExpired && compState?.deadlineAt);

  const isLocked = isConcluded || Boolean(arenaState?.isSubmitted);

  // Requirement 6: Anti-Cheating & Participant Monitoring
  const {
    focusWarning,
    isLockedByProctoring,
    lockStatus,
    isDisqualified,
    lockReason,
    warningCount,
    clearWarning,
    refreshStatus,
  } = useParticipantMonitoring({
    roundNumber: 2,
    isRoundActive: Boolean(isRoundActive && !isLocked),
    isSubmitted: Boolean(arenaState?.isSubmitted),
    isConcluded,
    questionId: arenaState?.questionId,
    arenaType: 'BUG_HUNT',
  });

  // Requirement 1 & 3: Automatic Round Conclusion & Workspace Locking when timer hits zero
  useEffect(() => {
    if (timer.isExpired && !arenaState?.isSubmitted && activeStage !== 'results') {
      setShowConcludedModal(true);
    }
  }, [timer.isExpired, arenaState?.isSubmitted, activeStage]);

  const handleBackToDashboard = () => {
    if (!isLocked && !isConcluded && !timer.isExpired && isRoundActive) {
      setShowLeaveWarningModal(true);
    } else {
      navigate('/team/dashboard');
    }
  };



  // Bug Investigation State
  const [isSubmittingBug, setIsSubmittingBug] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'warning';
    message: string;
  } | null>(null);

  // Code Repair Workspace State
  const [selectedLanguage, setSelectedLanguage] = useState<BugHuntLanguageCode>('c');
  const [languageDrafts, setLanguageDrafts] = useState<Record<string, string>>({});
  const [repairCode, setRepairCode] = useState('');
  const [repairsVerifiedCount, setRepairsVerifiedCount] = useState(0);
  const [verifiedBugKeys, setVerifiedBugKeys] = useState<string[]>([]);
  const [sampleTestsPassed, setSampleTestsPassed] = useState<number | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const autosaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedCodeRef = useRef<string>('');

  // Test Runner State
  const [selectedSampleIndex, setSelectedSampleIndex] = useState<number>(0);
  const [customStdin, setCustomStdin] = useState('');
  const [isRunningCode, setIsRunningCode] = useState(false);
  const [runResult, setRunResult] = useState<BugHuntTestRunResultDto | null>(null);
  const [runApiError, setRunApiError] = useState<string | null>(null);

  // Final Submission State
  const [isSubmittingFinal, setIsSubmittingFinal] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [_finalSubmissionData, setFinalSubmissionData] = useState<any | null>(null);
  const [showBriefingDetails, setShowBriefingDetails] = useState(true);
  const [showUnlockModal, setShowUnlockModal] = useState(false);

  // 1. Fetch initial Arena State
  const fetchState = useCallback(async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const data = await questionAndArenaService.getBugHuntState();
      setArenaState(data);

      // Resolve active language & independent per-language drafts
      const draft = await questionAndArenaService.getWorkspaceDraft(2, 1);
      const supported = (data.supportedLanguages && data.supportedLanguages.length > 0
        ? data.supportedLanguages
        : ['c', 'cpp', 'java', 'python']) as BugHuntLanguageCode[];
      const draftLang = (draft?.language || '').toLowerCase() as BugHuntLanguageCode;
      const savedLocalLang = (localStorage.getItem(`ignitron_r2_lang_${data.questionId}`) || '').toLowerCase() as BugHuntLanguageCode;
      const defaultDataLang = (data.language || 'c').toLowerCase() as BugHuntLanguageCode;
      const initialLang: BugHuntLanguageCode = supported.includes(draftLang)
        ? draftLang
        : supported.includes(savedLocalLang)
        ? savedLocalLang
        : supported.includes(defaultDataLang)
        ? defaultDataLang
        : (supported[0] || 'c');

      const draftsMap: Record<string, string> = { ...(data.languageDrafts || {}) };
      if (draft?.sourceCode && draft.sourceCode.trim() !== '' && !draftsMap[initialLang]) {
        draftsMap[initialLang] = draft.sourceCode;
      }

      const initialCode =
        draftsMap[initialLang] && draftsMap[initialLang].trim() !== ''
          ? draftsMap[initialLang]
          : data.languageStarterCodes?.[initialLang] || data.faultyCode;

      setSelectedLanguage(initialLang);
      setLanguageDrafts(draftsMap);
      setRepairCode(initialCode);
      lastSavedCodeRef.current = initialCode;

      if (data.isSubmitted) {
        setActiveStage('results');
      } else if (data.isInvestigationComplete) {
        setActiveStage('repair');
      }
    } catch (err: any) {
      setErrorMessage(
        err?.message ||
          'Unable to load Bug Hunt Arena. Ensure Round 2 is active and your team is shortlisted.',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  // Switch programming language while preserving independent per-language drafts
  const handleLanguageChange = async (newLang: BugHuntLanguageCode) => {
    if (newLang === selectedLanguage) return;

    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = null;
    }

    const prevLang = selectedLanguage;
    const prevCode = repairCode;

    if (arenaState?.questionId) {
      try {
        localStorage.setItem(`ignitron_r2_lang_${arenaState.questionId}`, newLang);
      } catch {
        // Ignore storage quota errors
      }
    }

    const updatedDrafts = {
      ...languageDrafts,
      [prevLang]: prevCode,
    };
    setLanguageDrafts(updatedDrafts);

    const nextCode =
      updatedDrafts[newLang] !== undefined && updatedDrafts[newLang].trim() !== ''
        ? updatedDrafts[newLang]
        : arenaState?.languageStarterCodes?.[newLang] || arenaState?.faultyCode || '';

    setSelectedLanguage(newLang);
    setRepairCode(nextCode);
    setRunResult(null);
    setRunApiError(null);
    setFeedback(null);
    lastSavedCodeRef.current = nextCode;

    if (arenaState?.isRepairUnlocked && !arenaState?.isSubmitted && !isLocked) {
      try {
        if (prevCode && prevCode.trim() !== '') {
          await questionAndArenaService.saveWorkspaceDraft({
            roundNumber: 2,
            caseNumber: 1,
            sourceCode: prevCode,
            language: prevLang,
          });
        }
        await questionAndArenaService.saveWorkspaceDraft({
          roundNumber: 2,
          caseNumber: 1,
          sourceCode: nextCode,
          language: newLang,
        });
      } catch {
        // Ignore silent draft sync error
      }
    }
  };

  // Autosave repair code debounced by 2 seconds
  const handleCodeChange = (value: string) => {
    setRepairCode(value);
    setLanguageDrafts((prev) => ({ ...prev, [selectedLanguage]: value }));
    if (!arenaState?.isRepairUnlocked || arenaState?.isSubmitted) return;

    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }

    autosaveTimeoutRef.current = setTimeout(async () => {
      if (value === lastSavedCodeRef.current) return;
      try {
        setIsSavingDraft(true);
        await questionAndArenaService.saveWorkspaceDraft({
          roundNumber: 2,
          caseNumber: 1,
          sourceCode: value,
          language: selectedLanguage,
        });
        lastSavedCodeRef.current = value;
        setLastSavedTime(
          new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        );
      } catch (err) {
        // Silently catch draft autosave errors
      } finally {
        setIsSavingDraft(false);
      }
    }, 2000);
  };

  // Direct click-to-identify defect interaction
  const handleDirectIdentify = async (
    rawText: string,
    lineNum: number,
    startOffset?: number,
    endOffset?: number,
  ) => {
    const text = (rawText || '').trim();
    if (!text || !arenaState?.questionId || isSubmittingBug) return;

    if (
      text.startsWith('//') ||
      text.startsWith('/*') ||
      text.startsWith('*') ||
      (selectedLanguage === 'python' && text.startsWith('#'))
    ) {
      setFeedback({
        type: 'error',
        message: 'Comments and documentation cannot be reported as defects. Inspect executable statements.',
      });
      return;
    }

    try {
      setIsSubmittingBug(true);
      setFeedback(null);

      const res = await questionAndArenaService.reportBug({
        questionId: arenaState.questionId,
        selectedText: text,
        language: selectedLanguage,
        lineNumber: lineNum,
        startOffset,
        endOffset,
      });

      if (res.isCorrect) {
        setFeedback({
          type: 'success',
          message: `🎯 Defect Isolated: ${res.bugName || res.bugKey}!`,
        });

        // Update local arena state with newly confirmed bug
        setArenaState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            identifiedCount: res.identifiedCount,
            isInvestigationComplete: res.isInvestigationComplete,
            isRepairUnlocked: res.isInvestigationComplete,
            identifiedBugs: res.identifiedBugs,
          };
        });

        // If investigation complete, prompt confirmation modal before entering Stage 2
        if (res.isInvestigationComplete) {
          setShowUnlockModal(true);
        }
      } else if (res.isDuplicate) {
        setFeedback({
          type: 'warning',
          message: res.message || 'This defect has already been isolated by your team.',
        });
      } else {
        setFeedback({
          type: 'error',
          message: `No defect found at line ${lineNum}: "${text.length > 30 ? text.slice(0, 30) + '...' : text}". Review the logic carefully.`,
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Error validating defect selection.',
      });
    } finally {
      setIsSubmittingBug(false);
      window.getSelection()?.removeAllRanges();
    }
  };

  // Execute Code Test Run against configured sample tests
  const handleRunCode = async () => {
    if (!repairCode || isRunningCode) return;

    try {
      setIsRunningCode(true);
      setRunResult(null);
      setRunApiError(null);

      const res = await questionAndArenaService.runBugHuntTest({
        questionId: arenaState?.questionId || '',
        sourceCode: repairCode,
        language: selectedLanguage,
        sampleIndex: selectedSampleIndex === 99 ? undefined : selectedSampleIndex,
        customStdin: selectedSampleIndex === 99 ? customStdin : undefined,
      });

      setRunResult(res);
      if (res.verifiedBugKeys) {
        setVerifiedBugKeys(res.verifiedBugKeys);
      }
      if (res.repairsVerifiedCount !== undefined) {
        setRepairsVerifiedCount(res.repairsVerifiedCount);
      }
      if (res.sampleTestsPassedCount !== undefined) {
        setSampleTestsPassed(res.sampleTestsPassedCount);
      }
    } catch (err: any) {
      // Never disguise HTTP 404 / 500 / network failures as Judge0 runtime errors
      setRunApiError(
        err?.message || 'Test execution request failed to reach the backend execution service.',
      );
    } finally {
      setIsRunningCode(false);
    }
  };

  // Final Submit Bug Fixes
  const handleSubmitFinal = async () => {
    try {
      setIsSubmittingFinal(true);
      setShowSubmitModal(false);

      const res = await questionAndArenaService.submitWorkspaceCode({
        roundNumber: 2,
        caseNumber: 1,
        sourceCode: repairCode,
        language: selectedLanguage,
      });

      setFinalSubmissionData(res);
      setArenaState((prev) => (prev ? { ...prev, isSubmitted: true } : prev));
      setActiveStage('results');
    } catch (err: any) {
      if (err?.message && err.message.toLowerCase().includes('already been submitted')) {
        setArenaState((prev) => (prev ? { ...prev, isSubmitted: true } : prev));
        setActiveStage('results');
      } else {
        alert(err?.message || 'Final submission failed.');
      }
    } finally {
      setIsSubmittingFinal(false);
    }
  };

  // Parsed code lines with exact character offsets & syntax tokenization
  const activeInvestigationCode = useMemo(() => {
    return (
      arenaState?.languageStarterCodes?.[selectedLanguage] ||
      arenaState?.faultyCode ||
      ''
    );
  }, [arenaState?.languageStarterCodes, arenaState?.faultyCode, selectedLanguage]);

  const parsedCodeLines = useMemo(() => {
    if (!activeInvestigationCode) return [];
    const lines = activeInvestigationCode.split('\n');
    let currentOffset = 0;
    const result: Array<{
      lineNumber: number;
      lineText: string;
      startOffset: number;
      endOffset: number;
      tokens: Array<{
        text: string;
        type: 'keyword' | 'builtin' | 'string' | 'number' | 'operator' | 'comment' | 'punctuation' | 'identifier' | 'whitespace';
        startOffset: number;
        endOffset: number;
        lineNumber: number;
      }>;
    }> = [];

    const isPython = selectedLanguage === 'python';
    const tokenRegex = isPython
      ? /(#[^\n]*|'(?:\\.|[^'])*'|"(?:\\.|[^"])*"|\+\=|\-\=|\*|\/|={2,3}|!=|\=|\!|\?|\:|\-|\+|[;,(){}\[\]\.]|\s+|[a-zA-Z0-9_]+|[^\s\w]+)/g
      : /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|'(?:\\.|[^'])*'|"(?:\\.|[^"])*"|`(?:\\.|[^`])*`|\+\=|\-\=|\*|\/|\&\&|\|\||\>\=|\<\=|={2,3}|!==|!=|\=|\!|\?|\:|\-|\+|[;,(){}\[\]\.]|\s+|[a-zA-Z0-9_$]+|[^\s\w]+)/g;

    lines.forEach((lineText, idx) => {
      const lineNum = idx + 1;
      const lineStart = currentOffset;
      const tokens: Array<{
        text: string;
        type: 'keyword' | 'builtin' | 'string' | 'number' | 'operator' | 'comment' | 'punctuation' | 'identifier' | 'whitespace';
        startOffset: number;
        endOffset: number;
        lineNumber: number;
      }> = [];
      let match: RegExpExecArray | null;
      tokenRegex.lastIndex = 0;

      const isCommentLine = isPython
        ? /^\s*#/.test(lineText)
        : /^\s*(\*|\/\/|\/\*)/.test(lineText);

      while ((match = tokenRegex.exec(lineText)) !== null) {
        const text = match[0];
        const startOffset = lineStart + match.index;
        const endOffset = startOffset + text.length;

        let type: 'keyword' | 'builtin' | 'string' | 'number' | 'operator' | 'comment' | 'punctuation' | 'identifier' | 'whitespace' = 'identifier';
        if (/^\s+$/.test(text)) {
          type = 'whitespace';
        } else if (
          (isPython && text.startsWith('#')) ||
          (!isPython && (/^(\/\/|\/\*)/.test(text) || (isCommentLine && (text === '*' || text === '/**' || text === '*/'))))
        ) {
          type = 'comment';
        } else if (/^['"`]/.test(text)) {
          type = 'string';
        } else if (/^\d+(\.\d+)?$/.test(text)) {
          type = 'number';
        } else if (/^(class|constructor|this|self|const|let|var|function|return|if|else|elif|try|catch|except|new|require|import|export|from|def|public|private|static|void|int|double|long|bool|boolean|struct|typedef|true|false|True|False|None|while|for|using|namespace|nullptr|NULL)$/.test(text)) {
          type = 'keyword';
        } else if (/^(Math|std|math|Date|console|fs|JSON|parseFloat|parseInt|String|Number|Boolean|System|out|println|printf|scanf|fprintf|strlen|strcmp|strtod|strstr|min|max|floor|fmin)$/.test(text)) {
          type = 'builtin';
        } else if (/^(\+\=|\-\=|\*|\/|\&\&|\|\||\>\=|\<\=|={2,3}|!==|!=|\=|\!|\?|\:|\-|\+)$/.test(text)) {
          type = 'operator';
        } else if (/^[;,(){}\[\]\.]$/.test(text)) {
          type = 'punctuation';
        }

        tokens.push({ text, type, startOffset, endOffset, lineNumber: lineNum });
      }

      result.push({
        lineNumber: lineNum,
        lineText,
        startOffset: lineStart,
        endOffset: lineStart + lineText.length,
        tokens,
      });

      currentOffset += lineText.length + 1;
    });

    return result;
  }, [activeInvestigationCode, selectedLanguage]);

  // Resolve identified bug location for the currently selected language (never mixing language coordinates)
  const getBugLocationForLanguage = useCallback(
    (b: BugHuntIdentifiedBugDto) => {
      const langLoc = b.languageLocations?.[selectedLanguage];
      if (langLoc) {
        return { lineNumber: langLoc.lineNumber, expression: langLoc.expression, fromLanguageMap: true };
      }
      if (!b.language || b.language.toLowerCase() === selectedLanguage.toLowerCase()) {
        return { lineNumber: b.lineNumber ?? null, expression: b.selectedText ?? null, fromLanguageMap: false };
      }
      return null;
    },
    [selectedLanguage],
  );

  // Set of identified line numbers for red highlight in the active language
  const identifiedLineSet = useMemo(() => {
    const lines = new Set<number>();
    if (!arenaState?.identifiedBugs) return lines;
    for (const b of arenaState.identifiedBugs) {
      const loc = getBugLocationForLanguage(b);
      if (loc?.lineNumber) {
        lines.add(loc.lineNumber);
      }
    }
    return lines;
  }, [arenaState?.identifiedBugs, getBugLocationForLanguage]);

  // Determine if a token belongs to an already identified defect in the active language
  const getMatchingIdentifiedBug = useCallback((token: { text: string; startOffset: number; endOffset: number; lineNumber: number }) => {
    if (!arenaState?.identifiedBugs || arenaState.identifiedBugs.length === 0) return null;
    for (const b of arenaState.identifiedBugs) {
      const loc = getBugLocationForLanguage(b);
      if (!loc) continue;
      if (loc.fromLanguageMap) {
        if (loc.lineNumber === token.lineNumber && loc.expression && loc.expression.includes(token.text)) {
          return b;
        }
      } else if (b.startOffset !== null && b.startOffset !== undefined && b.endOffset !== null && b.endOffset !== undefined) {
        if (token.startOffset >= b.startOffset - 2 && token.endOffset <= b.endOffset + 2) {
          return b;
        }
      } else if (loc.lineNumber === token.lineNumber) {
        if (loc.expression && loc.expression.includes(token.text)) {
          return b;
        }
      }
    }
    return null;
  }, [arenaState?.identifiedBugs, getBugLocationForLanguage]);

  const getTokenSyntaxClass = (type: string, isBug: boolean) => {
    if (isBug) {
      return 'bg-rose-950/90 text-rose-200 border border-rose-500/80 font-bold rounded shadow-[0_0_10px_rgba(244,63,94,0.4)]';
    }
    switch (type) {
      case 'keyword':
        return 'text-purple-400 font-semibold';
      case 'builtin':
        return 'text-cyan-400 font-medium';
      case 'string':
        return 'text-emerald-300';
      case 'number':
        return 'text-amber-400 font-mono';
      case 'operator':
        return 'text-sky-300 font-bold';
      case 'punctuation':
        return 'text-slate-400';
      case 'comment':
        return 'text-slate-500 italic';
      default:
        return 'text-slate-200';
    }
  };

  const langExtension = useMemo(() => {
    const lang = selectedLanguage?.toLowerCase();
    if (lang === 'python') return 'py';
    if (lang === 'cpp') return 'cpp';
    if (lang === 'java') return 'java';
    return 'c';
  }, [selectedLanguage]);

  const editorLanguageExtension = useMemo(() => {
    const lang = selectedLanguage?.toLowerCase();
    if (lang === 'python') return [python()];
    if (lang === 'java') return [java()];
    if (lang === 'cpp' || lang === 'c') return [cpp()];
    return [javascript()];
  }, [selectedLanguage]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#010905] flex flex-col items-center justify-center text-emerald-400 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-emerald-400" />
        <span className="font-mono text-sm tracking-wider uppercase">
          Initializing Round 2 &mdash; Bug Hunt Arena...
        </span>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="min-h-screen bg-[#010905] flex flex-col items-center justify-center p-6 text-slate-200">
        <div className="max-w-md w-full p-6 rounded-2xl bg-[#02130a] border border-rose-500/40 shadow-2xl text-center space-y-4">
          <ShieldAlert className="w-12 h-12 text-rose-400 mx-auto" />
          <h2 className="text-xl font-bold text-white">Arena Access Restricted</h2>
          <p className="text-xs text-rose-200/80 leading-relaxed">{errorMessage}</p>
          <div className="pt-2">
            <button
              onClick={() => navigate('/team/dashboard')}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors"
            >
              Return to Team Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const identifiedCount = arenaState?.identifiedCount || 0;
  const totalRequired = arenaState?.totalRequired || 4;
  const progressPercent = Math.min(100, Math.round((identifiedCount / totalRequired) * 100));

  return (
    <div className="min-h-screen bg-[#010804] text-slate-100 flex flex-col selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* ===================================================================== */}
      {/* TOP ARENA NAVIGATION & LIVE TIMER BAR                                */}
      {/* ===================================================================== */}
      <header className="sticky top-0 z-40 bg-[#02130a]/95 backdrop-blur-xl border-b border-emerald-500/30 px-4 sm:px-6 h-16 flex items-center justify-between shadow-[0_4px_25px_rgba(0,0,0,0.6)]">
        {/* Left: Back & Round Identity */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBackToDashboard}
            className="p-2 rounded-xl bg-emerald-950/60 border border-emerald-500/30 hover:bg-emerald-900/60 text-emerald-300 transition-colors cursor-pointer"
            title="Back to Dashboard"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/60 flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.4)]">
              <Bug className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-emerald-400">
                  ROUND 02
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                  BUG HUNT ARENA
                </span>
              </div>
              <h1 className="text-sm font-bold text-white tracking-tight hidden sm:block">
                {arenaState?.title || 'Bug Hunt: Student Result Analyzer'}
              </h1>
            </div>
          </div>
        </div>

        {/* Center: Stage Progress Tabs */}
        <div className="hidden md:flex items-center gap-1.5 p-1 rounded-xl bg-black/60 border border-emerald-500/20 text-xs font-mono">
          <button
            onClick={() => setActiveStage('investigation')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeStage === 'investigation'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/30'
                : 'text-emerald-300 hover:text-white'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>1. Bug Investigation</span>
            <span
              className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                identifiedCount === totalRequired
                  ? 'bg-emerald-950 text-emerald-300'
                  : 'bg-rose-950 text-rose-300'
              }`}
            >
              {identifiedCount}/{totalRequired}
            </span>
          </button>

          <button
            onClick={() => {
              if (arenaState?.isRepairUnlocked) setActiveStage('repair');
            }}
            disabled={!arenaState?.isRepairUnlocked}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeStage === 'repair'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/30'
                : arenaState?.isRepairUnlocked
                  ? 'text-emerald-300 hover:text-white'
                  : 'text-slate-600 cursor-not-allowed opacity-60'
            }`}
          >
            {arenaState?.isRepairUnlocked ? (
              <Unlock className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Lock className="w-3.5 h-3.5 text-slate-500" />
            )}
            <span>2. Code Repair &amp; Tests</span>
          </button>

          {arenaState?.isSubmitted && (
            <button
              onClick={() => setActiveStage('results')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                activeStage === 'results'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/30'
                  : 'text-emerald-300 hover:text-white'
              }`}
            >
              <FileCheck className="w-3.5 h-3.5" />
              <span>3. Submission Result</span>
            </button>
          )}
        </div>

        {/* Right: Server Authoritative Timer & Active Participant */}
        <div className="flex items-center gap-3">
          {/* Active Participant Badge */}
          <div className="hidden lg:flex flex-col text-right">
            <span className="text-xs font-bold text-white">
              {user?.type === 'TEAM' ? user.activeParticipant.fullName : user?.fullName}
            </span>
            <span className="text-[10px] font-mono text-emerald-400 flex items-center justify-end gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>TERMINAL MUTEX ACTIVE</span>
            </span>
          </div>

          {/* Server Timer */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono font-bold ${
              isCompetitionPaused
                ? 'bg-amber-950/60 border-amber-500/60 text-amber-300'
                : timer.isExpired
                  ? 'bg-rose-950/60 border-rose-500/60 text-rose-300'
                  : 'bg-emerald-950/60 border-emerald-500/60 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
            }`}
          >
            {isCompetitionPaused ? (
              <>
                <PauseCircle className="w-4 h-4 text-amber-400 animate-pulse" />
                <span>PAUSED</span>
              </>
            ) : (
              <>
                <Clock className="w-4 h-4 text-emerald-400" />
                <span>{timer.formatted}</span>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ===================================================================== */}
      {/* MISSION BRIEFING HEADER ACCORDION                                    */}
      {/* ===================================================================== */}
      <section className="bg-gradient-to-r from-emerald-950/40 via-[#01140a] to-emerald-950/40 border-b border-emerald-900/60 px-4 sm:px-6 py-4">
        <div className="max-w-7xl mx-auto space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Title & Metadata Badges */}
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 bg-purple-950/60 border border-purple-500/40 rounded-lg px-2 py-0.5">
                  <span className="text-[10px] font-mono font-bold uppercase text-purple-300">LANG:</span>
                  <select
                    value={selectedLanguage}
                    onChange={(e) => handleLanguageChange(e.target.value as BugHuntLanguageCode)}
                    disabled={isLocked || isConcluded}
                    aria-label="Select programming language"
                    className="bg-transparent text-[11px] font-mono font-bold uppercase text-white focus:outline-none cursor-pointer"
                  >
                    {(arenaState?.supportedLanguages && arenaState.supportedLanguages.length > 0
                      ? arenaState.supportedLanguages
                      : ['c', 'cpp', 'java', 'python']
                    ).map((langKey) => (
                      <option key={langKey} value={langKey} className="bg-[#02130a] text-white">
                        {langKey === 'c'
                          ? 'C (GCC 9.2.0)'
                          : langKey === 'cpp'
                          ? 'C++17 (GCC 9.2.0)'
                          : langKey === 'java'
                          ? 'Java (OpenJDK 13.0.1)'
                          : langKey === 'python'
                          ? 'Python (3.8.1)'
                          : langKey.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>
                <span className="px-2.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  BUGS IDENTIFIED: {identifiedCount} / {totalRequired}
                </span>
                <span className="px-2.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  {arenaState?.hasPerBugVerification
                    ? `REPAIRS VERIFIED: ${repairsVerifiedCount} / ${totalRequired}`
                    : sampleTestsPassed !== null
                    ? `TESTS PASSED: ${sampleTestsPassed} / ${arenaState?.sampleTestCases?.length || 0}`
                    : `OFFICIAL 100 MARKS`}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-extrabold text-white">
                {arenaState?.title || 'Mission 02: Bug Hunt Arena'}
              </h2>
            </div>

            {/* Dynamic Bug Isolation Progress */}
            <div className="flex items-center gap-4 bg-black/50 p-2.5 rounded-2xl border border-emerald-500/30">
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-xs font-mono">
                  <span className="text-slate-400">Isolated Defects:</span>
                  <strong
                    className={`font-bold ${
                      identifiedCount === totalRequired
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {identifiedCount} of {totalRequired} ({progressPercent}%)
                  </strong>
                </div>
                <div className="w-48 sm:w-56 h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      identifiedCount === totalRequired
                        ? 'bg-emerald-400 shadow-[0_0_10px_#10b981]'
                        : 'bg-rose-500 shadow-[0_0_10px_#f43f5e]'
                    }`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowBriefingDetails(!showBriefingDetails)}
                className="p-2 rounded-xl bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-300 text-xs font-mono flex items-center gap-1 border border-emerald-500/30 transition-colors"
                title="Toggle Briefing Details"
              >
                <span>Briefing</span>
                {showBriefingDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Expandable Briefing Details */}
          {showBriefingDetails && (
            <div className="mt-3 p-4 rounded-2xl bg-black/70 border border-emerald-500/30 space-y-3 text-xs leading-relaxed animate-fade-in">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5 text-emerald-200/80">
                  <strong className="text-emerald-400 font-mono block uppercase">
                    Mission Specifications &amp; Instructions
                  </strong>
                  <p className="whitespace-pre-wrap">
                    {arenaState?.description || 'Your mission is to investigate the flawed codebase, locate all planted logical defects, and submit a corrected repair.'}
                  </p>
                </div>
                <div className="space-y-1.5 text-emerald-200/80">
                  <strong className="text-amber-400 font-mono block uppercase">
                    Scoring Rubric Breakdown (100 Marks)
                  </strong>
                  <ul className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
                    <li className="flex items-center gap-1.5">
                      <span className="text-emerald-400">&bull;</span>
                      <span>Bug Identification: <strong>20 pts</strong></span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="text-emerald-400">&bull;</span>
                      <span>Test Correctness: <strong>50 pts</strong></span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="text-emerald-400">&bull;</span>
                      <span>Edge Cases: <strong>20 pts</strong></span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="text-emerald-400">&bull;</span>
                      <span>Code Quality: <strong>10 pts</strong></span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ===================================================================== */}
      {/* MAIN STAGE CONTENT                                                   */}
      {/* ===================================================================== */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 space-y-6">
        {/* STAGE 1: BUG INVESTIGATION INTERFACE */}
        {activeStage === 'investigation' && (
          <div className="space-y-6 animate-fade-in">
            {/* Stage 1 Instructions & Status Bar */}
            <div className="p-4 rounded-2xl bg-[#02130a] border border-emerald-500/30 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
                  <Crosshair className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm flex items-center gap-2">
                    <span>Direct Click-to-Identify Defect Interface</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-rose-500/20 text-rose-300 border border-rose-500/40">
                      1-Click Identification
                    </span>
                  </h3>
                  <p className="text-xs text-emerald-200/70">
                    Click directly on any faulty code token, expression or line below. Verified defects immediately turn <span className="text-rose-400 font-bold">RED</span> and advance your bug counter.
                  </p>
                </div>
              </div>

              {arenaState?.isRepairUnlocked && (
                <button
                  onClick={() => setActiveStage('repair')}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-md shadow-emerald-500/40 transition-all hover:scale-105 shrink-0"
                >
                  <Unlock className="w-4 h-4" />
                  <span>Proceed to Code Repair</span>
                </button>
              )}
            </div>

            {/* Real-time Feedback Banner */}
            {feedback && (
              <div
                className={`p-3.5 rounded-2xl border text-xs font-mono flex items-center gap-3 animate-fade-in ${
                  feedback.type === 'success'
                    ? 'bg-rose-950/80 border-rose-500 text-rose-200 shadow-[0_0_20px_rgba(244,63,94,0.4)]'
                    : feedback.type === 'warning'
                      ? 'bg-amber-950/80 border-amber-500 text-amber-200'
                      : 'bg-slate-900 border-rose-500/60 text-rose-300'
                }`}
              >
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="w-5 h-5 text-rose-400 shrink-0" />
                ) : feedback.type === 'warning' ? (
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                )}
                <span>{feedback.message}</span>
              </div>
            )}

            {/* Read-Only Syntax-Highlighted Code Viewer with Direct Click-to-Identify */}
            <div className="rounded-2xl border border-emerald-500/30 bg-[#010905] overflow-hidden shadow-2xl">
              <div className="px-4 py-2.5 bg-black/60 border-b border-emerald-950/80 flex items-center justify-between text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                  <span className="text-emerald-400 font-bold ml-2">
                    mission_code.{langExtension} ({selectedLanguage === 'c' ? 'C · GCC 9.2.0' : selectedLanguage === 'cpp' ? 'C++17 · GCC 9.2.0' : selectedLanguage === 'java' ? 'Java · OpenJDK 13.0.1' : selectedLanguage === 'python' ? 'Python · 3.8.1' : selectedLanguage.toUpperCase()}) &mdash; (Read-Only Investigation &bull; Click to Identify)
                  </span>
                </div>
                <span className="text-emerald-400/80 text-[11px] font-mono flex items-center gap-1.5">
                  <Crosshair className="w-3.5 h-3.5 text-rose-400" />
                  <span>Click tokens to isolate</span>
                </span>
              </div>

              {/* Code Lines Container */}
              <div className="p-4 overflow-x-auto font-mono text-xs leading-relaxed max-h-[550px] overflow-y-auto">
                {parsedCodeLines.map((line) => {
                  const lineNum = line.lineNumber;
                  const isFaultyLine = identifiedLineSet.has(lineNum);
                  const matchingLineBug = arenaState?.identifiedBugs.find((b) => {
                    const loc = getBugLocationForLanguage(b);
                    return loc?.lineNumber === lineNum;
                  });
                  const matchingLineExpr = matchingLineBug
                    ? getBugLocationForLanguage(matchingLineBug)?.expression || matchingLineBug.selectedText
                    : null;

                  return (
                    <div
                      key={lineNum}
                      data-line-number={lineNum}
                      className={`flex items-start group rounded px-2 py-0.5 transition-colors select-text ${
                        isFaultyLine
                          ? 'bg-rose-950/60 border-l-4 border-rose-500 text-rose-300 font-semibold shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                          : 'hover:bg-emerald-950/30'
                      }`}
                    >
                      {/* Line Number */}
                      <span
                        className={`w-10 shrink-0 text-right pr-4 select-none ${
                          isFaultyLine
                            ? 'text-rose-400 font-bold'
                            : 'text-slate-600 group-hover:text-emerald-400'
                        }`}
                      >
                        {lineNum}
                      </span>

                      {/* Line Tokens with Syntax Highlighting and Subtle Hover Outline */}
                      <span className="flex-1 whitespace-pre">
                        {line.tokens.map((token, tIdx) => {
                          if (token.type === 'whitespace') {
                            return <span key={tIdx}>{token.text}</span>;
                          }

                          const tokenBug = getMatchingIdentifiedBug(token);
                          const isBug =
                            Boolean(tokenBug) ||
                            (isFaultyLine &&
                              token.text.length > 2 &&
                              Boolean(matchingLineExpr?.includes(token.text)));
                          const syntaxClass = getTokenSyntaxClass(token.type, isBug);

                          if (token.type === 'comment') {
                            return (
                              <span
                                key={tIdx}
                                className={`${syntaxClass} cursor-default select-text`}
                                title="Comment (not a code defect)"
                              >
                                {token.text}
                              </span>
                            );
                          }

                          return (
                            <span
                              key={tIdx}
                              onClick={(e) => {
                                e.stopPropagation();
                                const sel = window.getSelection()?.toString().trim();
                                if (sel && sel.length >= 2) {
                                  handleDirectIdentify(
                                    sel,
                                    lineNum,
                                    token.startOffset,
                                    token.endOffset,
                                  );
                                } else {
                                  handleDirectIdentify(
                                    token.text,
                                    lineNum,
                                    token.startOffset,
                                    token.endOffset,
                                  );
                                }
                              }}
                              className={`rounded px-0.5 transition-all ${
                                isBug
                                  ? 'bg-rose-950/90 text-rose-200 border border-rose-500/80 font-bold shadow-[0_0_8px_rgba(244,63,94,0.5)]'
                                  : `${syntaxClass} cursor-pointer hover:outline hover:outline-1 hover:outline-emerald-400/60 hover:bg-emerald-500/15 hover:shadow-[0_0_8px_rgba(16,185,129,0.3)]`
                              }`}
                              title={
                                isBug
                                  ? `Isolated Defect: ${
                                      tokenBug?.bugName ||
                                      matchingLineBug?.bugName ||
                                      'Verified Defect'
                                    }`
                                  : `Click to report defect: ${token.text}`
                              }
                            >
                              {token.text}
                            </span>
                          );
                        })}
                      </span>

                      {/* Confirmed Defect Tag */}
                      {isFaultyLine && matchingLineBug && (
                        <span className="ml-3 px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold bg-rose-600/30 text-rose-300 border border-rose-500/60 shadow-[0_0_8px_rgba(244,63,94,0.4)] shrink-0 select-none">
                          DEFECT ISOLATED: {matchingLineBug.bugName}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Confirmed System Vulnerabilities Card */}
            <div className="p-5 rounded-2xl bg-[#02130a] border border-emerald-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-emerald-400" />
                  <h4 className="font-bold text-white text-sm">
                    Isolated Vulnerabilities ({identifiedCount}/{totalRequired})
                  </h4>
                </div>
                <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                  Bug Identification Score: {Math.round((identifiedCount / totalRequired) * 20)} / 20 Marks
                </span>
              </div>

              {identifiedCount === 0 ? (
                <div className="p-4 rounded-xl bg-black/40 border border-emerald-500/20 text-xs text-slate-400 text-center font-mono">
                  No defects isolated yet. Read through the Student Result Analyzer code and highlight faulty expressions above.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {arenaState?.identifiedBugs.map((bug: BugHuntIdentifiedBugDto, i: number) => (
                    <div
                      key={bug.bugKey || i}
                      className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 space-y-1.5 shadow-[0_0_15px_rgba(244,63,94,0.2)]"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5 text-rose-400" />
                          <span>{bug.bugName || bug.bugKey}</span>
                        </span>
                        {bug.lineNumber && (
                          <span className="text-[10px] font-mono text-rose-400 font-bold px-1.5 py-0.5 rounded bg-rose-950 border border-rose-500/40">
                            Line {bug.lineNumber}
                          </span>
                        )}
                      </div>
                      {bug.description && (
                        <p className="text-[11px] text-rose-200/70 leading-relaxed">
                          {bug.description}
                        </p>
                      )}
                      {bug.selectedText && (
                        <code className="text-[10px] font-mono text-rose-300 bg-black/60 px-2 py-0.5 rounded block truncate">
                          "{bug.selectedText}"
                        </code>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* STAGE 2: CODE REPAIR & TEST HARNESS */}
        {activeStage === 'repair' && (
          <div className="space-y-6 animate-fade-in">
            {/* Stage 2 Unlocked Header Bar */}
            <div className="p-4 rounded-2xl bg-[#02130a] border border-emerald-500/30 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/50 flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.4)]">
                  <Unlock className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">
                    Code Repair Terminal Unlocked
                  </h3>
                  <p className="text-xs text-emerald-200/70">
                    Fix the logic flaws in the CodeMirror editor below. Run tests against Judge0 and submit when confident.
                  </p>
                </div>
              </div>

              {/* Autosave Status */}
              <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
                {isSavingDraft ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Autosaving draft...</span>
                  </>
                ) : lastSavedTime ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Draft saved at {lastSavedTime}</span>
                  </>
                ) : (
                  <span>Autosave active</span>
                )}
              </div>
            </div>

            {/* Editor & Test Runner Split View */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* CodeMirror 6 Editor Column (7/12) */}
              <div className="lg:col-span-7 space-y-3">
                <div className="rounded-2xl border border-emerald-500/30 bg-[#020b06] overflow-hidden shadow-2xl flex flex-col h-[580px]">
                  {/* Editor Header Bar */}
                  <div className="px-4 py-2.5 bg-black/60 border-b border-emerald-950/80 flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <Code2 className="w-4 h-4 text-emerald-400" />
                      <span className="text-white font-bold">solution.{langExtension}</span>
                      <select
                        value={selectedLanguage}
                        onChange={(e) => handleLanguageChange(e.target.value as BugHuntLanguageCode)}
                        disabled={isLocked || isConcluded}
                        aria-label="Editor programming language"
                        className="bg-emerald-950/80 border border-emerald-500/30 rounded-lg px-2 py-0.5 text-emerald-300 text-[11px] font-mono font-bold uppercase focus:outline-none cursor-pointer"
                      >
                        {(arenaState?.supportedLanguages && arenaState.supportedLanguages.length > 0
                          ? arenaState.supportedLanguages
                          : ['c', 'cpp', 'java', 'python']
                        ).map((langKey) => (
                          <option key={langKey} value={langKey} className="bg-[#02130a] text-white">
                            {langKey === 'c'
                              ? 'C (GCC 9.2.0)'
                              : langKey === 'cpp'
                              ? 'C++17 (GCC 9.2.0)'
                              : langKey === 'java'
                              ? 'Java (OpenJDK 13.0.1)'
                              : langKey === 'python'
                              ? 'Python (3.8.1)'
                              : langKey.toUpperCase()}
                          </option>
                        ))}
                      </select>
                      {verifiedBugKeys.length > 0 && (
                        <span className="hidden sm:inline-flex px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px]">
                          REPAIRS VERIFIED: {repairsVerifiedCount} / {totalRequired}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleRunCode}
                        disabled={isRunningCode || isLocked || isConcluded || timer.isExpired}
                        className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-[0_0_12px_rgba(16,185,129,0.4)] disabled:opacity-50"
                      >
                        {isRunningCode ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Play className="w-3.5 h-3.5 fill-current" />
                        )}
                        <span>Run Test</span>
                      </button>

                      {!arenaState?.isSubmitted && (
                        <button
                          onClick={() => setShowSubmitModal(true)}
                          className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-[0_0_15px_rgba(251,191,36,0.5)]"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Final Submit</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* CodeMirror Editor */}
                  <div className="flex-1 min-h-0 relative overflow-hidden flex flex-col">
                    <CodeMirror
                      value={repairCode}
                      height="100%"
                      className="h-full flex-1 overflow-auto min-h-0"
                      extensions={[...editorLanguageExtension, customDarkTheme]}
                      theme={oneDark}
                      onChange={handleCodeChange}
                      editable={!isLocked && !isConcluded && !timer.isExpired}
                      basicSetup={{
                        lineNumbers: true,
                        bracketMatching: true,
                        closeBrackets: true,
                        autocompletion: true,
                        foldGutter: true,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Test Harness & Terminal Console Column (5/12) */}
              <div className="lg:col-span-5 space-y-4 flex flex-col h-[580px]">
                {/* Sample Test Case Selectors */}
                <div className="p-3.5 rounded-2xl bg-[#02130a] border border-emerald-500/30 space-y-2">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-400 font-bold block">
                    Select Test Scenario
                  </span>
                  <div className="flex items-center gap-2 text-xs font-mono">
                    {arenaState?.sampleTestCases?.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => { setSelectedSampleIndex(i); setRunResult(null); setRunApiError(null); }}
                        className={`px-3 py-1.5 rounded-xl transition-all ${
                          selectedSampleIndex === i
                            ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/30'
                            : 'bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50'
                        }`}
                      >
                        Sample #{i + 1}
                      </button>
                    ))}
                    <button
                      onClick={() => { setSelectedSampleIndex(99); setRunResult(null); setRunApiError(null); }}
                      className={`px-3 py-1.5 rounded-xl transition-all ${
                        selectedSampleIndex === 99
                          ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/30'
                          : 'bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50'
                      }`}
                    >
                      Custom Stdin
                    </button>
                  </div>

                  {/* Active Test Case Info */}
                  {selectedSampleIndex !== 99 && arenaState?.sampleTestCases?.[selectedSampleIndex] && (
                    <div className="p-3 rounded-xl bg-black/60 border border-emerald-500/20 text-xs font-mono space-y-1">
                      <div className="text-slate-400 text-[11px]">
                        Input: <code>{arenaState.sampleTestCases[selectedSampleIndex].stdin}</code>
                      </div>
                      <div className="text-emerald-300 text-[11px]">
                        Expected Output:{' '}
                        <code>{arenaState.sampleTestCases[selectedSampleIndex].expectedOutput}</code>
                      </div>
                      {arenaState.sampleTestCases[selectedSampleIndex].explanation && (
                        <p className="text-[10px] text-slate-400 italic pt-1">
                          {arenaState.sampleTestCases[selectedSampleIndex].explanation}
                        </p>
                      )}
                    </div>
                  )}

                  {selectedSampleIndex === 99 && (
                    <div className="space-y-1">
                      <textarea
                        rows={2}
                        value={customStdin}
                        onChange={(e) => setCustomStdin(e.target.value)}
                        placeholder="e.g. 80 70 90"
                        className="w-full bg-black/60 border border-emerald-500/30 rounded-xl p-2 font-mono text-xs text-white focus:outline-none focus:border-emerald-400"
                      />
                    </div>
                  )}
                </div>

                {/* Judge0 Execution Terminal Output */}
                <div className="flex-1 rounded-2xl bg-[#010905] border border-emerald-500/30 flex flex-col overflow-hidden shadow-2xl">
                  <div className="px-3.5 py-2 bg-black/60 border-b border-emerald-950/80 flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-300 font-bold">Execution Console</span>
                    </div>

                    {runApiError ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-500/50">
                        API EXECUTION ERROR
                      </span>
                    ) : runResult && (
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          runResult.passed
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                            : runResult.status === 'WRONG_ANSWER'
                            ? 'bg-rose-950 text-rose-300 border border-rose-500/50 shadow-[0_0_10px_rgba(244,63,94,0.3)]'
                            : runResult.status === 'COMPILATION_ERROR'
                            ? 'bg-amber-950 text-amber-300 border border-amber-500/50'
                            : 'bg-rose-950 text-rose-300 border border-rose-500/50'
                        }`}
                      >
                        {runResult.passed
                          ? '✓ TEST PASSED (ACCEPTED)'
                          : runResult.status === 'WRONG_ANSWER'
                          ? '✗ OUTPUT MISMATCH (WRONG ANSWER)'
                          : runResult.status === 'COMPILATION_ERROR'
                          ? 'COMPILATION ERROR'
                          : runResult.status === 'TIME_LIMIT_EXCEEDED'
                          ? 'TIME LIMIT EXCEEDED'
                          : 'RUNTIME ERROR'}
                      </span>
                    )}
                  </div>

                  <div className="p-3.5 flex-1 overflow-y-auto font-mono text-xs space-y-2">
                    {isRunningCode ? (
                      <div className="flex items-center gap-2 text-emerald-400 text-xs py-4">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Executing solution against Judge0 test runner...</span>
                      </div>
                    ) : runApiError ? (
                      <div className="p-3 rounded-xl border border-rose-500/40 bg-rose-950/40 text-rose-200 space-y-2">
                        <div className="flex items-center gap-2 font-bold text-rose-300">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          <span>Execution Endpoint Error</span>
                        </div>
                        <p className="text-xs font-mono">{runApiError}</p>
                        <p className="text-[11px] text-rose-300/80">
                          The backend API did not return a Judge0 execution result. Verify the backend deployment is up to date and reachable.
                        </p>
                      </div>
                    ) : runResult ? (
                      <div className="space-y-3">
                        {/* Status explanation alert */}
                        <div
                          className={`p-2.5 rounded-xl border text-xs flex items-center justify-between ${
                            runResult.passed
                              ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                              : runResult.status === 'WRONG_ANSWER'
                              ? 'bg-rose-950/40 border-rose-500/30 text-rose-300'
                              : 'bg-amber-950/40 border-amber-500/30 text-amber-300'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {runResult.passed ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                            )}
                            <span className="font-semibold">{runResult.message}</span>
                          </div>
                          {runResult.sampleIndex !== undefined && (
                            <span className="text-[10px] font-mono opacity-80">
                              Sample #{runResult.sampleIndex + 1}
                            </span>
                          )}
                        </div>

                        {/* Stdin (Input) */}
                        {runResult.stdin && (
                          <div className="space-y-1">
                            <span className="text-[10px] uppercase text-slate-400 font-bold block">
                              Standard Input (stdin):
                            </span>
                            <pre className="p-2 rounded-lg bg-black/70 border border-slate-800 text-slate-300 whitespace-pre-wrap font-mono text-[11px]">
                              {runResult.stdin}
                            </pre>
                          </div>
                        )}

                        {/* Expected Output vs Actual Output */}
                        {runResult.expectedOutput !== null && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <span className="text-[10px] uppercase text-emerald-400 font-bold block">
                                Expected Output:
                              </span>
                              <pre className="p-2 rounded-lg bg-black/70 border border-emerald-500/30 text-emerald-300 whitespace-pre-wrap font-mono text-[11px]">
                                {runResult.expectedOutput || '(empty)'}
                              </pre>
                            </div>
                            <div className="space-y-1">
                              <span
                                className={`text-[10px] uppercase font-bold block ${
                                  runResult.passed ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                Your Output (stdout):
                              </span>
                              <pre
                                className={`p-2 rounded-lg bg-black/70 border font-mono text-[11px] whitespace-pre-wrap ${
                                  runResult.passed
                                    ? 'border-emerald-500/30 text-emerald-200'
                                    : 'border-rose-500/40 text-rose-200'
                                }`}
                              >
                                {runResult.actualOutput ?? '(no stdout output)'}
                              </pre>
                            </div>
                          </div>
                        )}

                        {/* Custom Stdin output */}
                        {runResult.expectedOutput === null && runResult.actualOutput !== null && (
                          <div className="space-y-1">
                            <span className="text-[10px] uppercase text-emerald-400 font-bold block">
                              Output (stdout):
                            </span>
                            <pre className="p-2 rounded-lg bg-black/70 border border-emerald-500/20 text-emerald-200 whitespace-pre-wrap font-mono text-[11px]">
                              {runResult.actualOutput}
                            </pre>
                          </div>
                        )}

                        {/* Compiler Diagnostics */}
                        {runResult.compileOutput && (
                          <div className="space-y-1">
                            <span className="text-[10px] uppercase text-amber-400 font-bold block">
                              Compiler Diagnostics:
                            </span>
                            <pre className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-500/40 text-amber-200 whitespace-pre-wrap font-mono text-[11px]">
                              {runResult.compileOutput}
                            </pre>
                          </div>
                        )}

                        {/* Stderr / Runtime Error */}
                        {runResult.stderr && (
                          <div className="space-y-1">
                            <span className="text-[10px] uppercase text-rose-400 font-bold block">
                              Stderr:
                            </span>
                            <pre className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-200 whitespace-pre-wrap font-mono text-[11px]">
                              {runResult.stderr}
                            </pre>
                          </div>
                        )}

                        {/* Execution Metrics */}
                        <div className="flex items-center gap-3 pt-2 text-[10px] text-slate-400 border-t border-emerald-950/80">
                          {runResult.executionTimeSeconds !== null && (
                            <span>Time: <strong className="text-emerald-400">{runResult.executionTimeSeconds}s</strong></span>
                          )}
                          {runResult.memoryUsageKb !== null && (
                            <span>Memory: <strong className="text-emerald-400">{Math.round(runResult.memoryUsageKb)} KB</strong></span>
                          )}
                          <span className="ml-auto text-slate-500">
                            Status: <strong className="text-slate-300">{runResult.status}</strong>
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-slate-500 text-center py-10">
                        Click "Run Test" to execute your repaired solution against the selected scenario.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STAGE 3: COMPACT SUBMISSION CONFIRMATION VIEW */}
        {activeStage === 'results' && (
          <div className="max-w-xl mx-auto space-y-6 animate-fade-in">
            <div className="p-7 sm:p-9 rounded-3xl bg-[#02130a] border-2 border-emerald-400/60 shadow-[0_0_50px_rgba(16,185,129,0.35)] space-y-5 text-center">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-400/60 flex items-center justify-center text-emerald-400 mx-auto shadow-[0_0_20px_rgba(16,185,129,0.5)]">
                <CheckCircle2 className="w-9 h-9" />
              </div>

              <div className="space-y-2">
                <span className="px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  ROUND SUBMITTED SUCCESSFULLY
                </span>
                <h3 className="text-2xl font-black text-white">
                  Round 2 Submission Recorded
                </h3>
                <p className="text-sm text-emerald-200/80 max-w-md mx-auto leading-relaxed">
                  Your response has been submitted successfully.
                </p>
                <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                  Your submission has been recorded. The results will be announced by the organizers.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-black/60 border border-emerald-500/30 font-mono text-center">
                <span className="text-xs text-emerald-400 font-bold">
                  Submission Status: <span className="text-white">Submitted</span>
                </span>
              </div>

              <p className="text-xs text-emerald-400/90 font-medium">
                Thank you for participating in IGNITRON 2K26!
              </p>

              <div className="pt-4 flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => setActiveStage('repair')}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-white text-xs font-mono font-bold transition-colors cursor-pointer"
                >
                  View Submitted Code
                </button>
                <Link
                  to="/team/dashboard"
                  className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs font-mono transition-all shadow-[0_0_20px_rgba(16,185,129,0.5)] cursor-pointer"
                >
                  Return to Dashboard
                </Link>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ===================================================================== */}
      {/* CODE REPAIR UNLOCKED CONFIRMATION MODAL                               */}
      {/* ===================================================================== */}
      {showUnlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#02130A] border-2 border-emerald-400/80 rounded-3xl p-7 max-w-md w-full text-center shadow-[0_0_50px_rgba(16,185,129,0.35)] space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-400/60 flex items-center justify-center text-emerald-400 mx-auto shadow-[0_0_20px_rgba(16,185,129,0.5)]">
              <Unlock className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <span className="px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                STAGE UNLOCKED
              </span>
              <h2 className="text-xl font-black text-white tracking-wide">
                CODE REPAIR UNLOCKED
              </h2>
              <p className="text-xs text-emerald-300 font-semibold leading-relaxed">
                Congratulations! You have successfully identified all 4 planted bugs.
              </p>
              <p className="text-xs text-emerald-200/80 leading-relaxed">
                You have unlocked the next stage: <strong>Code Repair &amp; Tests</strong>.
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">
                You can now repair your code, run test cases and submit your solution.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setShowUnlockModal(false);
                setActiveStage('repair');
              }}
              className="w-full py-3 px-4 bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-sm rounded-xl transition-all shadow-[0_0_25px_rgba(16,185,129,0.5)] flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Continue to Code Repair</span>
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* FINAL SUBMIT CONFIRMATION MODAL                                      */}
      {/* ===================================================================== */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="max-w-md w-full p-6 rounded-3xl bg-[#02130a] border-2 border-emerald-400/60 shadow-2xl space-y-5 text-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-400/60 flex items-center justify-center text-amber-400 mx-auto">
              <Send className="w-6 h-6" />
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-bold text-white">
                Submit Final Round 2 Bug Fixes?
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                This will lock your team's solution and evaluate it against all official sample and hidden test suites. Once submitted, your workspace will become read-only.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-black/60 border border-emerald-500/20 text-xs font-mono text-emerald-300">
              Bug Identification Score: 20/20 secured
            </div>

            <div className="flex items-center justify-center gap-3 pt-2 font-mono text-xs font-bold">
              <button
                onClick={() => setShowSubmitModal(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitFinal}
                disabled={isSubmittingFinal}
                className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.6)] flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
              >
                {isSubmittingFinal ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>Confirm &amp; Submit</span>
              </button>
            </div>
          </div>
        </div>
      )}
    
      {/* REQUIREMENT 5: RETURN TO DASHBOARD WARNING MODAL */}
      {showLeaveWarningModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#031712] border-2 border-amber-400/80 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-[0_0_30px_rgba(245,158,11,0.3)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Return to Dashboard?</h3>
                <p className="text-xs text-amber-400/90 font-mono">Active Round in Progress</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              Your competition round is currently active. Returning to the dashboard will not stop the countdown, and your time will continue running.
            </p>
            <p className="text-xs text-amber-300/90 font-medium">
              Are you sure you want to leave the workspace?
            </p>

            <div className="flex justify-end gap-3 pt-2 font-mono text-xs">
              <button
                type="button"
                onClick={() => setShowLeaveWarningModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Stay in Workspace
              </button>
              <button
                type="button"
                onClick={() => navigate('/team/dashboard')}
                className="px-5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-bold uppercase tracking-wider transition-all cursor-pointer shadow-md"
              >
                Return to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REQUIREMENT 6: COMPETITION FOCUS WARNING MODAL */}
      {focusWarning && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#031712] border-2 border-amber-400 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-[0_0_40px_rgba(245,158,11,0.35)] text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-400/50 flex items-center justify-center text-amber-400 mx-auto shadow-inner">
              <AlertTriangle className="w-7 h-7 animate-bounce" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-white">Competition Focus Warning</h3>
              <p className="text-xs font-mono text-amber-400 font-semibold">
                Warning {focusWarning.violationCount} of {focusWarning.threshold}
              </p>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              You have left the active competition workspace. Switching tabs or leaving the competition environment is not permitted during the competition.
            </p>
            <p className="text-[11px] text-amber-300/80 font-mono">
              Please return to your workspace immediately. Continued departures will trigger official access revocation.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={clearWarning}
                className="w-full py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-bold uppercase font-mono text-xs tracking-wider transition-all cursor-pointer shadow-md"
              >
                I Understand & Return to Workspace
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ANTI-CHEAT EXAM-LOCK OVERLAY */}
      <ExamLockOverlay
        isOpen={isLockedByProctoring}
        lockStatus={lockStatus}
        isDisqualified={isDisqualified}
        lockReason={lockReason}
        warningCount={warningCount}
        onRefreshStatus={refreshStatus}
        onReturnToDashboard={() => navigate('/team/dashboard')}
      />

      {/* REQUIREMENT 3 & 4: ROUND CONCLUDED / WORKSPACE LOCKED MODAL */}
      {showConcludedModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#02130a] border-2 border-emerald-400/60 rounded-3xl max-w-lg w-full p-7 sm:p-8 space-y-5 text-center shadow-[0_0_50px_rgba(16,185,129,0.35)]">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-400/60 flex items-center justify-center text-emerald-400 mx-auto shadow-[0_0_20px_rgba(16,185,129,0.5)]">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <div className="space-y-2">
              <span className="px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                ROUND CONCLUDED
              </span>
              <h3 className="text-2xl font-black text-white">Workspace Locked</h3>
              <p className="text-sm text-emerald-200/90 max-w-md mx-auto leading-relaxed">
                The competition time has ended. Your workspace is now locked.
              </p>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                Your submitted code has been safely recorded.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-black/60 border border-emerald-500/30 font-mono text-center">
              <span className="text-xs text-emerald-400 font-bold">
                Submission Status: <span className="text-white">Submitted</span>
              </span>
            </div>
            <div className="pt-3 flex flex-col sm:flex-row items-center justify-center gap-3 font-mono text-xs">
              <button
                type="button"
                onClick={() => {
                  setShowConcludedModal(false);
                  setActiveStage('repair');
                }}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-white font-bold transition-colors cursor-pointer"
              >
                View Submitted Code
              </button>
              <Link
                to="/team/dashboard"
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#00F5A0] hover:bg-[#34D399] text-black font-black uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(0,245,160,0.4)]"
              >
                Return to Dashboard
              </Link>
            </div>
          </div>
        </div>
      )}
</div>
  );
};
