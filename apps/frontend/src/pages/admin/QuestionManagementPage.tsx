import React, { useState, useEffect, useRef } from 'react';
import { questionAndArenaService } from '../../services/question-and-arena.service';
import {
  QuestionDto,
  QuestionType,
  CreateQuestionDto,
  BugHuntPlantedBug,
  TestCaseDto,
} from '@ignitron/shared';
import {
  HelpCircle,
  Plus,
  Trash2,
  Edit3,
  CheckCircle2,
  RefreshCw,
  BookOpen,
  Layers,
  Clock,
  Sparkles,
  AlertCircle,
  X,
  Code,
  Save,
  Bug,
  Eye,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';

export const QuestionManagementPage: React.FC = () => {
  const [activeRound, setActiveRound] = useState<number>(1);
  const [includeArchived, setIncludeArchived] = useState<boolean>(false);
  const [questions, setQuestions] = useState<QuestionDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [previewModalOpen, setPreviewModalOpen] = useState<boolean>(false);
  const [previewQuestion, setPreviewQuestion] = useState<QuestionDto | null>(null);
  const [previewTab, setPreviewTab] = useState<'PARTICIPANT' | 'ADMIN'>('PARTICIPANT');
  const [editingQuestion, setEditingQuestion] = useState<QuestionDto | null>(null);

  // Base Form fields
  const [formRound, setFormRound] = useState<number>(1);
  const [formType, setFormType] = useState<QuestionType>('MCQ');
  const [formOrder, setFormOrder] = useState<number>(1);
  const [formCaseNumber, setFormCaseNumber] = useState<number>(1);
  const [formTitle, setFormTitle] = useState<string>('');
  const [formDescription, setFormDescription] = useState<string>('');
  const [formMarks, setFormMarks] = useState<number>(2);
  const [formOptions, setFormOptions] = useState<string[]>(['', '', '', '']);
  const [formCorrectOption, setFormCorrectOption] = useState<number>(0);
  const [formExplanation, setFormExplanation] = useState<string>('');
  const [formStarterCode, setFormStarterCode] = useState<string>('');
  const [formLanguage, setFormLanguage] = useState<string>('javascript');

  // Round 2 Extended Fields
  const [formDifficulty, setFormDifficulty] = useState<string>('MEDIUM');
  const [formIsActive, setFormIsActive] = useState<boolean>(true);
  const [formPlantedBugs, setFormPlantedBugs] = useState<BugHuntPlantedBug[]>([]);
  const [formSampleTestCases, setFormSampleTestCases] = useState<TestCaseDto[]>([]);
  const [formHiddenTestCases, setFormHiddenTestCases] = useState<(TestCaseDto & { isEdgeCase?: boolean })[]>([]);
  const [formSupportedLanguages, setFormSupportedLanguages] = useState<string[]>(['javascript']);
  const [formLanguageStarterCodes, setFormLanguageStarterCodes] = useState<Record<string, string>>({});
  const [activeStarterLangTab, setActiveStarterLangTab] = useState<string>('javascript');

  // Interactive Code Selection for Planted Bugs
  const starterCodeTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [codeSelectionInfo, setCodeSelectionInfo] = useState<{
    text: string;
    line: number;
    startOffset: number;
    endOffset: number;
  } | null>(null);

  const fetchQuestions = async () => {
    setLoading(true);
    try {
      const data = await questionAndArenaService.listAdminQuestions(activeRound, undefined, includeArchived);
      setQuestions(data);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to load questions.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuestions();
  }, [activeRound, includeArchived]);

  const handleSeedQuestions = async () => {
    if (!confirm('Populate the default official question bank for IGNITRON 2K26? (15 MCQs for Round 1, Bug Hunt problem for Round 2, and 3 Cases for Round 3).')) {
      return;
    }
    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await questionAndArenaService.seedQuestions();
      setFeedback({ type: 'success', message: res.message });
      await fetchQuestions();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to seed question bank.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingQuestion(null);
    setFormRound(activeRound);
    setFormType(activeRound === 1 ? 'MCQ' : activeRound === 2 ? 'BUG_HUNT' : 'CODING_CASE');
    setFormOrder(questions.length + 1);
    setFormCaseNumber(activeRound === 3 ? Math.min(3, questions.length + 1) : 1);
    setFormTitle('');
    setFormDescription('');
    setFormMarks(activeRound === 1 ? 2 : activeRound === 2 ? 100 : 25);
    setFormOptions(['Option A', 'Option B', 'Option C', 'Option D']);
    setFormCorrectOption(0);
    setFormExplanation('');
    setFormStarterCode('');
    setFormLanguage(activeRound === 2 ? 'python' : 'javascript');
    setFormDifficulty('MEDIUM');
    setFormIsActive(true);
    setFormPlantedBugs([]);
    setFormSampleTestCases([
      { stdin: '', expectedOutput: '', explanation: 'Standard sample test case' },
    ]);
    setFormHiddenTestCases([
      { stdin: '', expectedOutput: '', marks: 25, isEdgeCase: false },
      { stdin: '', expectedOutput: '', marks: 25, isEdgeCase: true },
    ]);
    setCodeSelectionInfo(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (q: QuestionDto) => {
    setEditingQuestion(q);
    setFormRound(q.roundNumber || activeRound);
    setFormType(q.type);
    setFormOrder(q.orderNumber);
    setFormCaseNumber(q.caseNumber || 1);
    setFormTitle(q.title);
    setFormDescription(q.description);
    setFormMarks(q.marks);
    setFormOptions(q.options && q.options.length ? [...q.options] : ['', '', '', '']);
    setFormCorrectOption(q.correctOption ?? 0);
    setFormExplanation(q.explanation || '');
    setFormStarterCode(q.starterCode || '');
    const resolvedLang = q.language === 'typescript' ? 'javascript' : (q.language || 'javascript');
    setFormLanguage(resolvedLang);
    setFormDifficulty(q.rubric?.difficulty || 'MEDIUM');
    setFormIsActive(q.isActive ?? true);
    setFormPlantedBugs(q.plantedBugs ? JSON.parse(JSON.stringify(q.plantedBugs)) : []);
    setFormSampleTestCases(q.sampleTestCases ? JSON.parse(JSON.stringify(q.sampleTestCases)) : []);
    setFormHiddenTestCases(q.hiddenTestCases ? JSON.parse(JSON.stringify(q.hiddenTestCases)) : []);
    const rubricLangs = Array.isArray(q.rubric?.supportedLanguages) && q.rubric.supportedLanguages.length > 0
      ? q.rubric.supportedLanguages
      : [resolvedLang];
    setFormSupportedLanguages(rubricLangs);
    setFormLanguageStarterCodes({
      ...(q.rubric?.languageStarterCodes || {}),
      [resolvedLang]: q.rubric?.languageStarterCodes?.[resolvedLang] || q.starterCode || '',
    });
    setActiveStarterLangTab(resolvedLang);
    setCodeSelectionInfo(null);
    setModalOpen(true);
  };

  const handleStarterCodeSelect = () => {
    const el = starterCodeTextareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (start !== undefined && end !== undefined && start !== end) {
      const selected = el.value.substring(start, end).trim();
      if (selected) {
        const textBefore = el.value.substring(0, start);
        const line = textBefore.split('\n').length;
        setCodeSelectionInfo({
          text: selected,
          line,
          startOffset: start,
          endOffset: end,
        });
        return;
      }
    }
    setCodeSelectionInfo(null);
  };

  const handleStarterCodeChange = (newCode: string) => {
    setFormStarterCode(newCode);

    // Automatically recalculate or validate offsets for existing planted bugs when code changes
    if (formType === 'BUG_HUNT' && formPlantedBugs.length > 0) {
      const updatedBugs = formPlantedBugs.map((bug) => {
        if (!bug.expression) return bug;
        // If expression is still at exact startOffset, keep it
        if (
          bug.startOffset !== undefined &&
          newCode.substring(bug.startOffset, bug.startOffset + bug.expression.length) === bug.expression
        ) {
          return bug;
        }
        // If code shifted, find the updated index
        const newStart = newCode.indexOf(bug.expression);
        if (newStart !== -1) {
          const newLine = newCode.substring(0, newStart).split('\n').length;
          return {
            ...bug,
            startOffset: newStart,
            endOffset: newStart + bug.expression.length,
            lineNumber: newLine,
          };
        }
        return bug;
      });
      setFormPlantedBugs(updatedBugs);
    }
  };

  const handleAddBugFromSelection = () => {
    if (!codeSelectionInfo) return;
    const newBugKey = `BUG_${formPlantedBugs.length + 1}_${Date.now().toString().slice(-4)}`;
    const newBug: BugHuntPlantedBug = {
      key: newBugKey,
      name: `Defect #${formPlantedBugs.length + 1}`,
      description: `Identified defect at line ${codeSelectionInfo.line}`,
      lineNumber: codeSelectionInfo.line,
      expression: codeSelectionInfo.text,
      startOffset: codeSelectionInfo.startOffset,
      endOffset: codeSelectionInfo.endOffset,
      correctedExpression: '',
      notes: '',
      marks: 5,
      acceptableTokens: [codeSelectionInfo.text.trim()],
    };
    setFormPlantedBugs([...formPlantedBugs, newBug]);
    setCodeSelectionInfo(null);
  };

  const handleAddEmptyBug = () => {
    const newBugKey = `BUG_${formPlantedBugs.length + 1}_${Date.now().toString().slice(-4)}`;
    const newBug: BugHuntPlantedBug = {
      key: newBugKey,
      name: `Defect #${formPlantedBugs.length + 1}`,
      description: 'Faulty logic defect',
      lineNumber: 1,
      expression: '',
      correctedExpression: '',
      notes: '',
      marks: 5,
      acceptableTokens: [],
    };
    setFormPlantedBugs([...formPlantedBugs, newBug]);
  };

  const handleRemoveBug = (index: number) => {
    setFormPlantedBugs(formPlantedBugs.filter((_, idx) => idx !== index));
  };

  const handleUpdateBug = (index: number, field: keyof BugHuntPlantedBug, val: any) => {
    const updated = [...formPlantedBugs];
    updated[index] = { ...updated[index], [field]: val };
    setFormPlantedBugs(updated);
  };

  const handleAddSampleTest = () => {
    setFormSampleTestCases([...formSampleTestCases, { stdin: '', expectedOutput: '', explanation: '' }]);
  };

  const handleRemoveSampleTest = (index: number) => {
    setFormSampleTestCases(formSampleTestCases.filter((_, idx) => idx !== index));
  };

  const handleUpdateSampleTest = (index: number, field: keyof TestCaseDto, val: any) => {
    const updated = [...formSampleTestCases];
    updated[index] = { ...updated[index], [field]: val };
    setFormSampleTestCases(updated);
  };

  const handleAddHiddenTest = () => {
    setFormHiddenTestCases([
      ...formHiddenTestCases,
      { stdin: '', expectedOutput: '', marks: 20, isEdgeCase: false },
    ]);
  };

  const handleRemoveHiddenTest = (index: number) => {
    setFormHiddenTestCases(formHiddenTestCases.filter((_, idx) => idx !== index));
  };

  const handleUpdateHiddenTest = (index: number, field: string, val: any) => {
    const updated = [...formHiddenTestCases];
    updated[index] = { ...updated[index], [field]: val };
    setFormHiddenTestCases(updated);
  };

  const handleTogglePublish = async (q: QuestionDto) => {
    setActionLoading(true);
    try {
      await questionAndArenaService.togglePublish(q.id, !q.isActive);
      setFeedback({
        type: 'success',
        message: `Mission "${q.title}" ${!q.isActive ? 'published' : 'unpublished'}.`,
      });
      await fetchQuestions();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to update publication status.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formDescription.trim()) {
      setFeedback({ type: 'error', message: 'Title and description are required.' });
      return;
    }

    setActionLoading(true);
    setFeedback(null);

    try {
      const payload: CreateQuestionDto = {
        roundNumber: formRound,
        type: formType,
        orderNumber: Number(formOrder),
        caseNumber: formRound === 3 ? Number(formCaseNumber) : null,
        title: formTitle.trim(),
        description: formDescription.trim(),
        marks: Number(formMarks),
        options: formType === 'MCQ' ? formOptions.filter((o) => o.trim().length > 0) : null,
        correctOption: formType === 'MCQ' ? Number(formCorrectOption) : null,
        explanation: formExplanation.trim() || null,
        starterCode: formType !== 'MCQ' ? formStarterCode : null,
        language: formType !== 'MCQ' ? formLanguage : null,
        isActive: formIsActive,
        rubric: {
          ...(editingQuestion?.rubric || {}),
          difficulty: formDifficulty,
          ...(formType === 'BUG_HUNT'
            ? {
                supportedLanguages: formSupportedLanguages.length > 0 ? formSupportedLanguages : [formLanguage],
                languageStarterCodes: {
                  ...formLanguageStarterCodes,
                  [formLanguage]: formStarterCode,
                },
              }
            : {}),
        },
        plantedBugs: formType === 'BUG_HUNT' ? formPlantedBugs : null,
        sampleTestCases: formType !== 'MCQ' ? formSampleTestCases : null,
        hiddenTestCases: formType !== 'MCQ' ? formHiddenTestCases : null,
      };

      if (editingQuestion) {
        await questionAndArenaService.updateQuestion(editingQuestion.id, payload);
        setFeedback({ type: 'success', message: 'Question updated successfully.' });
      } else {
        await questionAndArenaService.createQuestion(payload);
        setFeedback({ type: 'success', message: 'Question created successfully.' });
      }

      setModalOpen(false);
      await fetchQuestions();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to save question.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this question? Questions with participant submissions cannot be deleted.')) {
      return;
    }
    setActionLoading(true);
    try {
      await questionAndArenaService.deleteQuestion(id);
      setFeedback({ type: 'success', message: 'Question deleted.' });
      await fetchQuestions();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to delete question.' });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8faf9] pb-16">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 pt-4">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-emerald-950 flex items-center gap-3">
              <span>Question Management</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
                Official Bank
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Curate and configure problem statements, multiple-choice options, faulty codebases, and multi-case final coding challenges.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-nowrap">
            <button
              onClick={handleSeedQuestions}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition shadow-xs disabled:opacity-50 whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>Seed Official Bank</span>
            </button>
            <button
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-xs whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>{activeRound === 2 ? 'Add Mission' : 'Add Question'}</span>
            </button>
          </div>
        </div>

        {/* Feedback alert */}
        {feedback && (
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-medium ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
            <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Round Switcher Tabs */}
        <div className="flex border-b border-slate-200 gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveRound(1)}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition whitespace-nowrap ${
              activeRound === 1
                ? 'border-emerald-600 text-emerald-900 bg-emerald-50/50 rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <BookOpen className="w-4 h-4 text-emerald-600" />
            <span>Round 1: MCQ Arena (15 Questions × 2 Marks = 30)</span>
          </button>
          <button
            onClick={() => setActiveRound(2)}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition whitespace-nowrap ${
              activeRound === 2
                ? 'border-emerald-600 text-emerald-900 bg-emerald-50/50 rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="w-4 h-4 text-emerald-600" />
            <span>Round 2: Bug Hunt Arena (100 Marks Rubric)</span>
          </button>
          <button
            onClick={() => setActiveRound(3)}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition whitespace-nowrap ${
              activeRound === 3
                ? 'border-emerald-600 text-emerald-900 bg-emerald-50/50 rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock className="w-4 h-4 text-emerald-600" />
            <span>Round 3: Final Coding (100 Marks: 20 + 25 + 55)</span>
          </button>
        </div>

        {/* Round 2 Rubric Banner */}
        {activeRound === 2 && (
          <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200/80 text-xs text-emerald-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
            <div className="flex items-center gap-2">
              <Bug className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>
                <strong>Round 2 Bug Hunt Rubric:</strong> Defect Identification (20 pts) + Test Correctness (50 pts) + Edge Cases (20 pts) + Code Quality & Architecture (10 pts) = <strong>100 Total Marks</strong>.
              </span>
            </div>
            <span className="font-mono font-bold text-emerald-800 bg-white px-2 py-0.5 rounded-md border border-emerald-200 shrink-0 self-start sm:self-auto">
              100 Max Points
            </span>
          </div>
        )}

        {/* Round 3 Scoring Rubric Information Banner */}
        {activeRound === 3 && (
          <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200/80 text-xs text-emerald-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>
                <strong>Round 3 Tournament Rubric:</strong> Case 1: Participant Performance Analysis (20 pts) + Case 2: Data Cleaning and Submission Analysis (25 pts) + Case 3: Event Intelligence and Team Ranking (55 pts) = <strong>100 Total Marks</strong>.
              </span>
            </div>
            <span className="font-mono font-bold text-emerald-800 bg-white px-2 py-0.5 rounded-md border border-emerald-200 shrink-0 self-start sm:self-auto">
              100 Max Points
            </span>
          </div>
        )}

        {/* Content Table / List */}
        {loading ? (
          <div className="py-16 text-center text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
            <p className="text-xs">Loading competition questions...</p>
          </div>
        ) : questions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-4">
            <HelpCircle className="w-10 h-10 text-slate-300 mx-auto" />
            <div className="max-w-sm mx-auto">
              <h3 className="text-sm font-bold text-slate-800">No questions found for Round {activeRound}</h3>
              <p className="text-xs text-slate-500 mt-1">
                Click &quot;Seed Official Bank&quot; above to populate the official 15 MCQs, bug hunt codebase, and final coding challenges automatically.
              </p>
            </div>
            <button
              onClick={handleSeedQuestions}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Seed Official Bank Now</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 px-1">
              <div className="flex items-center gap-3">
                <span>
                  Showing {questions.length} {includeArchived ? 'total' : 'active'} questions for Round {activeRound}
                </span>
                <label className="inline-flex items-center gap-1.5 cursor-pointer select-none text-[11px] font-medium text-slate-500 hover:text-slate-700">
                  <input
                    type="checkbox"
                    checked={includeArchived}
                    onChange={(e) => setIncludeArchived(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Show Archived</span>
                </label>
              </div>
              <span className="font-mono font-medium">
                {activeRound === 2
                  ? `Configured Missions: ${questions.length} (Published: ${questions.filter((q) => q.isActive).length})`
                  : activeRound === 3
                  ? `Total Marks: ${questions.reduce((sum, q) => sum + q.marks, 0)} (6 Questions across 3 Cases)`
                  : `Total Marks: ${questions.reduce((sum, q) => sum + q.marks, 0)}`}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {questions.map((q) => (
                <div
                  key={q.id}
                  className={`bg-white rounded-xl border p-5 shadow-xs transition ${
                    q.isActive ? 'border-slate-200 hover:border-emerald-300' : 'border-amber-200 bg-amber-50/20'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                          #{q.orderNumber}
                        </span>

                        {/* Round 2 specific badges */}
                        {activeRound === 2 && (
                          <>
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase border ${
                                q.isActive
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : 'bg-amber-100 text-amber-800 border-amber-300'
                              }`}
                            >
                              {q.isActive ? '● PUBLISHED' : '○ DRAFT'}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase ${
                                (q.rubric?.difficulty || 'MEDIUM') === 'EASY'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : (q.rubric?.difficulty || 'MEDIUM') === 'HARD'
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}
                            >
                              {q.rubric?.difficulty || 'MEDIUM'}
                            </span>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-purple-100 text-purple-800 border border-purple-200 uppercase">
                              {q.language || 'javascript'}
                            </span>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                              <Bug className="w-3 h-3" />
                              {q.plantedBugs?.length || 0} Planted Bugs
                            </span>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-slate-100 text-slate-700">
                              {q.sampleTestCases?.length || 0} Sample / {q.hiddenTestCases?.length || 0} Hidden Tests
                            </span>
                          </>
                        )}

                        {q.caseNumber && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase bg-blue-100 text-blue-800 border border-blue-200">
                            Case {q.caseNumber}
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-slate-100 text-slate-700">
                          {q.marks} Marks
                        </span>
                        {activeRound === 3 && (
                          <>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                              {q.rubric?.format === 'SELECT_CODE' ? 'SELECT CODE' : 'WRITE CODE'}
                            </span>
                            {q.rubric?.technology && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                {q.rubric.technology}
                              </span>
                            )}
                          </>
                        )}
                        {q.type !== 'MCQ' && activeRound !== 2 && q.language && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-purple-100 text-purple-800 uppercase">
                            {q.language}
                          </span>
                        )}
                      </div>

                      <h3 className="text-sm font-bold text-emerald-950">{q.title}</h3>
                      <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed whitespace-pre-wrap">
                        {q.description}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Round 2 Preview Mission */}
                      {activeRound === 2 && (
                        <button
                          onClick={() => {
                            setPreviewQuestion(q);
                            setPreviewModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:text-emerald-700 hover:border-emerald-300 text-xs font-semibold transition"
                          title="Preview participant mission view"
                        >
                          <Eye className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Preview</span>
                        </button>
                      )}

                      {/* Round 2 Toggle Publish / Unpublish */}
                      {activeRound === 2 && (
                        <button
                          onClick={() => handleTogglePublish(q)}
                          disabled={actionLoading}
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition ${
                            q.isActive
                              ? 'border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100'
                              : 'border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100'
                          }`}
                          title={q.isActive ? 'Unpublish mission' : 'Publish mission to participants'}
                        >
                          {q.isActive ? 'Unpublish' : 'Publish'}
                        </button>
                      )}

                      <button
                        onClick={() => handleOpenEdit(q)}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-emerald-700 hover:border-emerald-300 transition"
                        title="Edit question"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(q.id)}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-red-700 hover:border-red-300 transition"
                        title="Delete question"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* MCQ Options Display */}
                  {q.type === 'MCQ' && q.options && (
                    <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {q.options.map((opt, idx) => (
                        <div
                          key={idx}
                          className={`p-2 rounded-lg border flex items-center gap-2 ${
                            idx === q.correctOption
                              ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950 font-medium'
                              : 'bg-slate-50/60 border-slate-200 text-slate-700'
                          }`}
                        >
                          <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border shrink-0 bg-white">
                            {String.fromCharCode(65 + idx)}
                          </span>
                          <span className="truncate">{opt}</span>
                          {idx === q.correctOption && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 ml-auto shrink-0" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Starter code snippet preview */}
                  {q.starterCode && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <div className="text-[11px] font-bold text-slate-500 mb-1 flex items-center gap-1.5">
                        <Code className="w-3.5 h-3.5" />
                        <span>{activeRound === 2 ? 'Faulty Starter Code:' : 'Starter Code Template:'}</span>
                      </div>
                      <pre className="text-[11px] font-mono bg-slate-900 text-slate-200 p-2.5 rounded-lg overflow-x-auto max-h-28">
                        {q.starterCode.slice(0, 300)}...
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* CREATE / EDIT MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs overflow-y-auto">
          <div
            className={`bg-white rounded-2xl w-full border border-slate-200 shadow-2xl p-6 space-y-4 my-8 max-h-[92vh] overflow-y-auto ${
              formType === 'BUG_HUNT' ? 'max-w-4xl' : 'max-w-2xl'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h2 className="text-base font-bold text-emerald-950 flex items-center gap-2">
                  {editingQuestion ? 'Edit Competition Question' : 'Create New Competition Question'}
                  {formType === 'BUG_HUNT' && (
                    <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                      Round 2 Bug Hunt
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-500">
                  {formType === 'BUG_HUNT'
                    ? 'Configure mission prompt, faulty code, planted bugs with line ranges, and test suites.'
                    : 'Configure round parameters, prompt, scoring, and evaluation criteria.'}
                </p>
              </div>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuestion} className="space-y-5 text-xs">
              {formType === 'BUG_HUNT' && (
                <div className="flex items-center gap-2 pb-1.5 border-b border-emerald-500/30 text-emerald-950 font-bold uppercase tracking-wider text-[11px]">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">A</span>
                  <span>Section A: Mission Configuration</span>
                </div>
              )}
              {/* Basic metadata row */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Target Round</label>
                  <select
                    value={formRound}
                    onChange={(e) => {
                      const r = Number(e.target.value);
                      setFormRound(r);
                      setFormType(r === 1 ? 'MCQ' : r === 2 ? 'BUG_HUNT' : 'CODING_CASE');
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  >
                    <option value={1}>Round 1 (MCQ)</option>
                    <option value={2}>Round 2 (Bug Hunt)</option>
                    <option value={3}>Round 3 (Final)</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Order #</label>
                  <input
                    type="number"
                    value={formOrder}
                    onChange={(e) => setFormOrder(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                    min={1}
                    required
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Total Marks</label>
                  <input
                    type="number"
                    value={formMarks}
                    onChange={(e) => setFormMarks(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                    step="0.5"
                    min={1}
                    required
                  />
                </div>

                {formType === 'BUG_HUNT' ? (
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Difficulty</label>
                    <select
                      value={formDifficulty}
                      onChange={(e) => setFormDifficulty(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold"
                    >
                      <option value="EASY">EASY</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="HARD">HARD</option>
                    </select>
                  </div>
                ) : formRound === 3 ? (
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Case Number</label>
                    <select
                      value={formCaseNumber}
                      onChange={(e) => setFormCaseNumber(Number(e.target.value))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                    >
                      <option value={1}>Case 1 (Participant Performance Analysis - 20)</option>
                      <option value={2}>Case 2 (Data Cleaning and Submission Analysis - 25)</option>
                      <option value={3}>Case 3 (Event Intelligence and Team Ranking - 55)</option>
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Status</label>
                    <span className="inline-block px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 font-medium">
                      Active
                    </span>
                  </div>
                )}
              </div>

              {/* Title & Language row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="font-bold text-slate-700 block mb-1">
                    {formType === 'BUG_HUNT' ? 'Mission Title' : 'Question Title'}
                  </label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder={
                      formType === 'BUG_HUNT'
                        ? 'e.g. Distributed Token Bucket Rate Limiter Defect'
                        : 'e.g. Asymptotic Complexity of Binary Heap'
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                    required
                  />
                </div>

                {formType !== 'MCQ' && (
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Programming Language</label>
                    <select
                      value={formLanguage}
                      onChange={(e) => setFormLanguage(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold"
                    >
                      <option value="python">Python 3 (ID: 71)</option>
                      <option value="cpp">C++17 (ID: 54)</option>
                      <option value="java">Java 17 (ID: 62)</option>
                      <option value="c">C GCC (ID: 50)</option>
                      <option value="javascript">JavaScript (ID: 63)</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Publication status & Supported Languages for Round 2 */}
              {formType === 'BUG_HUNT' && (
                <div className="space-y-3">
                  <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-emerald-950 block">Published Status</span>
                      <span className="text-[11px] text-emerald-800">
                        When checked, participants entering Round 2 will load and attempt this mission.
                      </span>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-emerald-900">
                      <input
                        type="checkbox"
                        checked={formIsActive}
                        onChange={(e) => setFormIsActive(e.target.checked)}
                        className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                      />
                      <span>Publish Immediately</span>
                    </label>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    <span className="font-bold text-slate-800 block">
                      Enabled Participant Languages (Only enable languages with configured starter code)
                    </span>
                    <div className="flex flex-wrap items-center gap-3">
                      {[
                        { key: 'javascript', label: 'JavaScript' },
                        { key: 'python', label: 'Python 3' },
                        { key: 'cpp', label: 'C++17' },
                        { key: 'c', label: 'C (GCC)' },
                        { key: 'java', label: 'Java 17' },
                      ].map((lang) => {
                        const checked = formSupportedLanguages.includes(lang.key);
                        return (
                          <label
                            key={lang.key}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 cursor-pointer font-semibold text-xs"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFormSupportedLanguages([...formSupportedLanguages, lang.key]);
                                  setActiveStarterLangTab(lang.key);
                                } else {
                                  const next = formSupportedLanguages.filter((l) => l !== lang.key);
                                  setFormSupportedLanguages(next.length > 0 ? next : [formLanguage]);
                                }
                              }}
                              className="w-3.5 h-3.5 text-emerald-600 rounded"
                            />
                            <span>{lang.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Description / Instructions */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  {formType === 'BUG_HUNT' ? 'Mission Description & Operational Objectives' : 'Problem Statement / Prompt'}
                </label>
                <textarea
                  rows={4}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder={
                    formType === 'BUG_HUNT'
                      ? 'Describe the mission scenario, subsystem architecture, and specific debugging instructions...'
                      : 'Detailed problem statement or question description (supports Markdown)...'
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono"
                  required
                />
              </div>

              {/* MCQ Options */}
              {formType === 'MCQ' && (
                <div className="space-y-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="font-bold text-slate-800">Multiple Choice Options (4 Choices)</div>
                  <div className="space-y-2">
                    {formOptions.map((opt, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="correctOptionRadio"
                          checked={formCorrectOption === idx}
                          onChange={() => setFormCorrectOption(idx)}
                          className="text-emerald-600 focus:ring-emerald-500"
                          title="Mark as correct answer"
                        />
                        <span className="font-bold text-slate-500 w-4">{String.fromCharCode(65 + idx)}:</span>
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => {
                            const newOpts = [...formOptions];
                            newOpts[idx] = e.target.value;
                            setFormOptions(newOpts);
                          }}
                          placeholder={`Option ${String.fromCharCode(65 + idx)} text`}
                          className="flex-1 px-3 py-1.5 border border-slate-200 rounded-md text-xs"
                          required
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-500 italic mt-1">
                    Select the radio button next to the option that is the strictly correct answer.
                  </p>
                </div>
              )}

              {/* Starter Code Editor */}
              {formType !== 'MCQ' && (
                <div className="space-y-2">
                  {formType === 'BUG_HUNT' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 pb-1.5 border-b border-emerald-500/30 text-emerald-950 font-bold uppercase tracking-wider text-[11px]">
                        <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">B</span>
                        <span>Section B: Faulty Starter Code (Authoritative Source)</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {formSupportedLanguages.map((langKey) => (
                          <button
                            key={langKey}
                            type="button"
                            onClick={() => setActiveStarterLangTab(langKey)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold uppercase border transition cursor-pointer ${
                              activeStarterLangTab === langKey
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            {langKey}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="font-bold text-slate-700">
                        {formType === 'BUG_HUNT' ? 'Faulty Starter Code Editor' : 'Starter Code Template'}
                      </label>
                      {formType === 'BUG_HUNT' && (
                        <p className="text-[11px] text-slate-500">
                          Highlight any faulty expression below and click &quot;Add Selection as Planted Bug&quot; to auto-populate.
                        </p>
                      )}
                    </div>
                    {formType === 'BUG_HUNT' && codeSelectionInfo && (
                      <button
                        type="button"
                        onClick={handleAddBugFromSelection}
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-[11px] shadow-xs transition"
                      >
                        <Bug className="w-3.5 h-3.5" />
                        <span>Add Selection as Bug (Line {codeSelectionInfo.line})</span>
                      </button>
                    )}
                  </div>

                  <textarea
                    ref={starterCodeTextareaRef}
                    rows={formType === 'BUG_HUNT' ? 12 : 6}
                    value={
                      formType === 'BUG_HUNT'
                        ? (activeStarterLangTab === formLanguage
                            ? formStarterCode
                            : formLanguageStarterCodes[activeStarterLangTab] ?? '')
                        : formStarterCode
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      if (formType === 'BUG_HUNT') {
                        setFormLanguageStarterCodes((prev) => ({
                          ...prev,
                          [activeStarterLangTab]: val,
                        }));
                        if (activeStarterLangTab === formLanguage) {
                          handleStarterCodeChange(val);
                        }
                      } else {
                        handleStarterCodeChange(val);
                      }
                    }}
                    onSelect={handleStarterCodeSelect}
                    placeholder={`// Paste faulty starter code for ${activeStarterLangTab}...`}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono bg-slate-900 text-slate-200 leading-relaxed"
                    required={formType !== 'BUG_HUNT' || activeStarterLangTab === formLanguage}
                  />

                  {formType === 'BUG_HUNT' && codeSelectionInfo && (
                    <div className="p-2 rounded bg-rose-50 border border-rose-200 text-rose-800 text-[11px] flex items-center justify-between">
                      <span>
                        Selected expression at <strong>Line {codeSelectionInfo.line}</strong>: &quot;
                        <span className="font-mono font-bold">{codeSelectionInfo.text}</span>&quot;
                      </span>
                      <button
                        type="button"
                        onClick={handleAddBugFromSelection}
                        className="text-rose-700 hover:underline font-bold"
                      >
                        Capture Bug →
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ROUND 2 PLANTED BUGS CONFIGURATION */}
              {formType === 'BUG_HUNT' && (
                <div className="space-y-3 pt-3 border-t border-slate-200">
                  <div className="flex items-center gap-2 pb-1.5 border-b border-rose-500/30 text-rose-950 font-bold uppercase tracking-wider text-[11px]">
                    <span className="w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center text-[10px]">C</span>
                    <span>Section C: Planted Bug Configuration (4 Defects — 20 Marks)</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                        <Bug className="w-4 h-4 text-rose-600" />
                        <span>Planted Bug Configuration ({formPlantedBugs.length} Total Bugs)</span>
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Participants must directly click or identify each defect to unlock code repair.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddEmptyBug}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg border border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Bug</span>
                    </button>
                  </div>

                  {formPlantedBugs.length === 0 ? (
                    <div className="p-4 rounded-xl border border-dashed border-slate-300 text-center text-slate-500 text-xs">
                      No planted bugs configured yet. Highlight text in the code above or click &quot;Add Bug&quot;.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {formPlantedBugs.map((bug, bIdx) => {
                        const isExpressionInCode =
                          !bug.expression || formStarterCode.includes(bug.expression);

                        return (
                          <div
                            key={bIdx}
                            className={`p-3 rounded-xl border text-xs space-y-2.5 transition ${
                              isExpressionInCode
                                ? 'bg-slate-50 border-slate-200'
                                : 'bg-rose-50/60 border-rose-300'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                                  #{bIdx + 1}
                                </span>
                                <input
                                  type="text"
                                  value={bug.name || `Defect #${bIdx + 1}`}
                                  onChange={(e) => handleUpdateBug(bIdx, 'name', e.target.value)}
                                  placeholder="Defect Name / Subsystem"
                                  className="font-bold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-emerald-500 px-1 py-0.5"
                                />
                                {!isExpressionInCode && (
                                  <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" />
                                    Expression not in starter code!
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveBug(bIdx)}
                                className="text-slate-400 hover:text-rose-600 p-1"
                                title="Remove bug"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                              <div>
                                <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                  Unique Key
                                </label>
                                <input
                                  type="text"
                                  value={bug.key}
                                  onChange={(e) => handleUpdateBug(bIdx, 'key', e.target.value)}
                                  className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs font-mono"
                                  required
                                />
                              </div>

                              <div>
                                <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                  Line
                                </label>
                                <input
                                  type="number"
                                  value={bug.lineNumber}
                                  onChange={(e) =>
                                    handleUpdateBug(bIdx, 'lineNumber', Number(e.target.value))
                                  }
                                  className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs font-mono"
                                  min={1}
                                  required
                                />
                              </div>

                              <div>
                                <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                  Range (Offsets)
                                </label>
                                <span className="block px-2 py-1 bg-slate-100 border border-slate-200 rounded text-[11px] font-mono text-slate-700 truncate" title={`${bug.startOffset ?? '?'}..${bug.endOffset ?? '?'}`}>
                                  {bug.startOffset !== undefined && bug.endOffset !== undefined
                                    ? `${bug.startOffset}..${bug.endOffset}`
                                    : 'Auto-sync'}
                                </span>
                              </div>

                              <div className="sm:col-span-2">
                                <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                  Faulty Expression (Exact Token / Substring)
                                </label>
                                <input
                                  type="text"
                                  value={bug.expression}
                                  onChange={(e) => handleUpdateBug(bIdx, 'expression', e.target.value)}
                                  placeholder="Exact faulty token or substring in code"
                                  className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs font-mono"
                                  required
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <div>
                                <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                  Marks (5 per defect = 20 total)
                                </label>
                                <input
                                  type="number"
                                  value={bug.marks ?? 5}
                                  onChange={(e) =>
                                    handleUpdateBug(bIdx, 'marks', Number(e.target.value))
                                  }
                                  className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs font-mono"
                                  min={1}
                                  required
                                />
                              </div>

                              <div>
                                <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                  Corrected Expression
                                </label>
                                <input
                                  type="text"
                                  value={bug.correctedExpression || ''}
                                  onChange={(e) =>
                                    handleUpdateBug(bIdx, 'correctedExpression', e.target.value)
                                  }
                                  placeholder="Expected repair code"
                                  className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs font-mono"
                                />
                              </div>

                              <div>
                                <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                  Acceptable Tokens (comma separated)
                                </label>
                                <input
                                  type="text"
                                  value={(bug.acceptableTokens || []).join(', ')}
                                  onChange={(e) =>
                                    handleUpdateBug(
                                      bIdx,
                                      'acceptableTokens',
                                      e.target.value
                                        .split(',')
                                        .map((s) => s.trim())
                                        .filter(Boolean),
                                    )
                                  }
                                  placeholder="e.g. rateLimit, <=, tokens"
                                  className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs font-mono"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                Defect Explanation / Root Cause
                              </label>
                              <input
                                type="text"
                                value={bug.description}
                                onChange={(e) =>
                                  handleUpdateBug(bIdx, 'description', e.target.value)
                                }
                                placeholder="Why this logic is flawed and what symptoms it causes..."
                                className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs"
                                required
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TEST SUITES: PUBLIC, HIDDEN & EDGE CASES */}
              {formType !== 'MCQ' && (
                <div className="space-y-4 pt-3 border-t border-slate-200">
                  {/* Public Sample Test Cases */}
                  <div className="space-y-2">
                    {formType === 'BUG_HUNT' && (
                      <div className="flex items-center gap-2 pb-1.5 border-b border-emerald-500/30 text-emerald-950 font-bold uppercase tracking-wider text-[11px]">
                        <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">D</span>
                        <span>Section D: Visible Sample Tests (Passing Suite — 50 Marks)</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Public Sample Test Cases ({formSampleTestCases.length})</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleAddSampleTest}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-200 hover:bg-slate-50 transition"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add Sample Test</span>
                      </button>
                    </div>

                    <div className="space-y-2">
                      {formSampleTestCases.map((tc, tcIdx) => (
                        <div
                          key={tcIdx}
                          className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/50 grid grid-cols-1 sm:grid-cols-3 gap-2"
                        >
                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                              Standard Input (stdin)
                            </label>
                            <textarea
                              rows={2}
                              value={tc.stdin}
                              onChange={(e) =>
                                handleUpdateSampleTest(tcIdx, 'stdin', e.target.value)
                              }
                              placeholder="Input lines..."
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                              Expected Output
                            </label>
                            <textarea
                              rows={2}
                              value={tc.expectedOutput}
                              onChange={(e) =>
                                handleUpdateSampleTest(tcIdx, 'expectedOutput', e.target.value)
                              }
                              placeholder="Expected stdout..."
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs font-mono"
                              required
                            />
                          </div>
                          <div className="flex flex-col justify-between">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                Explanation
                              </label>
                              <input
                                type="text"
                                value={tc.explanation || ''}
                                onChange={(e) =>
                                  handleUpdateSampleTest(tcIdx, 'explanation', e.target.value)
                                }
                                placeholder="Public sample explanation"
                                className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveSampleTest(tcIdx)}
                              className="self-end text-xs text-rose-600 hover:underline font-bold mt-1"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Hidden & Edge Cases */}
                  <div className="space-y-2">
                    {formType === 'BUG_HUNT' && (
                      <div className="flex items-center gap-2 pb-1.5 border-b border-amber-500/30 text-amber-950 font-bold uppercase tracking-wider text-[11px]">
                        <span className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-[10px]">E</span>
                        <span>Section E: Hidden & Edge-Case Tests (Boundary Handling — 20 Marks)</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <span>Hidden &amp; Edge-Case Test Cases ({formHiddenTestCases.length})</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleAddHiddenTest}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-200 hover:bg-slate-50 transition"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add Hidden Test</span>
                      </button>
                    </div>

                    <div className="space-y-2">
                      {formHiddenTestCases.map((tc, tcIdx) => (
                        <div
                          key={tcIdx}
                          className="p-2.5 rounded-lg border border-amber-200 bg-amber-50/20 grid grid-cols-1 sm:grid-cols-4 gap-2"
                        >
                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                              Hidden Input (stdin)
                            </label>
                            <textarea
                              rows={2}
                              value={tc.stdin}
                              onChange={(e) =>
                                handleUpdateHiddenTest(tcIdx, 'stdin', e.target.value)
                              }
                              placeholder="Hidden input..."
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                              Expected Output
                            </label>
                            <textarea
                              rows={2}
                              value={tc.expectedOutput}
                              onChange={(e) =>
                                handleUpdateHiddenTest(tcIdx, 'expectedOutput', e.target.value)
                              }
                              placeholder="Expected stdout..."
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs font-mono"
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                              Points / Weight
                            </label>
                            <input
                              type="number"
                              value={tc.marks || 10}
                              onChange={(e) =>
                                handleUpdateHiddenTest(tcIdx, 'marks', Number(e.target.value))
                              }
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs font-mono"
                            />
                            <label className="flex items-center gap-1.5 mt-1.5 cursor-pointer text-[10px] font-bold text-amber-900">
                              <input
                                type="checkbox"
                                checked={!!tc.isEdgeCase}
                                onChange={(e) =>
                                  handleUpdateHiddenTest(tcIdx, 'isEdgeCase', e.target.checked)
                                }
                                className="w-3.5 h-3.5 text-amber-600 rounded border-slate-300"
                              />
                              <span>Edge-Case Test</span>
                            </label>
                          </div>
                          <div className="flex flex-col justify-end">
                            <button
                              type="button"
                              onClick={() => handleRemoveHiddenTest(tcIdx)}
                              className="self-end text-xs text-rose-600 hover:underline font-bold"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Admin notes */}
              <div className="space-y-2">
                {formType === 'BUG_HUNT' && (
                  <div className="flex items-center gap-2 pb-1.5 border-b border-slate-300 text-slate-900 font-bold uppercase tracking-wider text-[11px]">
                    <span className="w-5 h-5 rounded-full bg-slate-700 text-white flex items-center justify-center text-[10px]">F</span>
                    <span>Section F: Internal Solution & Notes (Code Cleanliness — 10 Marks)</span>
                  </div>
                )}
                <label className="font-bold text-slate-700 block mb-1">Admin Notes / Internal Solution</label>
                <textarea
                  rows={2}
                  value={formExplanation}
                  onChange={(e) => setFormExplanation(e.target.value)}
                  placeholder="Notes for organizers, benchmark solutions, edge cases..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              {/* Submit / Cancel Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{editingQuestion ? 'Update Question' : 'Save Question'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ROUND 2 MISSION PREVIEW MODAL */}
      {previewModalOpen && previewQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full border border-slate-200 shadow-2xl p-6 space-y-4 my-8 max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-emerald-100 text-emerald-800">
                    Mission #{previewQuestion.orderNumber}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                      previewQuestion.isActive
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {previewQuestion.isActive ? 'PUBLISHED' : 'DRAFT'}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-purple-100 text-purple-800">
                    {previewQuestion.language || 'javascript'}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-slate-100 text-slate-800">
                    {previewQuestion.marks || 100} Marks
                  </span>
                </div>
                <h2 className="text-lg font-extrabold text-emerald-950 mt-1">
                  {previewQuestion.title}
                </h2>
              </div>
              <button
                onClick={() => setPreviewModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* View Selector Tabs */}
            <div className="flex border-b border-slate-200 text-xs font-bold">
              <button
                onClick={() => setPreviewTab('PARTICIPANT')}
                className={`px-4 py-2 border-b-2 flex items-center gap-2 transition ${
                  previewTab === 'PARTICIPANT'
                    ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Eye className="w-4 h-4" />
                <span>Participant-Facing Challenge View</span>
              </button>
              <button
                onClick={() => setPreviewTab('ADMIN')}
                className={`px-4 py-2 border-b-2 flex items-center gap-2 transition ${
                  previewTab === 'ADMIN'
                    ? 'border-rose-600 text-rose-700 bg-rose-50/50'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Administrator-Only Confidential Details</span>
              </button>
            </div>

            {/* TAB 1: PARTICIPANT-FACING VIEW */}
            {previewTab === 'PARTICIPANT' && (
              <div className="space-y-4">
                <div className="p-3 bg-emerald-50/60 border border-emerald-200/80 rounded-xl text-xs text-emerald-900">
                  <strong>Participant Experience:</strong> Contestants identify 4 planted defects in the code below to unlock Code Repair, then test and submit their repaired code against visible test scenarios.
                </div>

                {/* Briefing */}
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Operational Mission Briefing
                  </h4>
                  <div className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200 font-sans">
                    {previewQuestion.description}
                  </div>
                </div>

                {/* Faulty Starter Code */}
                {previewQuestion.starterCode && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <Code className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Authoritative Starter Code ({previewQuestion.language || 'javascript'})</span>
                      </h4>
                      <span className="text-[11px] font-mono text-slate-500">
                        {previewQuestion.starterCode.split('\n').length} Lines
                      </span>
                    </div>
                    <div className="text-xs font-mono bg-slate-950 text-slate-200 p-3 rounded-xl overflow-x-auto max-h-64 leading-relaxed border border-slate-800">
                      {previewQuestion.starterCode.split('\n').map((lineText, idx) => (
                        <div key={idx} className="flex items-start px-2 py-0.5 hover:bg-slate-900/60">
                          <span className="w-8 shrink-0 text-right pr-3 select-none text-slate-600">
                            {idx + 1}
                          </span>
                          <span className="flex-1 whitespace-pre">{lineText}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Visible Sample Test Scenarios */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Visible Sample Test Scenarios ({previewQuestion.sampleTestCases?.length || 0})</span>
                  </h4>
                  {previewQuestion.sampleTestCases && previewQuestion.sampleTestCases.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {previewQuestion.sampleTestCases.map((tc, idx) => (
                        <div key={idx} className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 space-y-1.5 text-xs font-mono">
                          <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                            <span>Sample Scenario #{idx + 1}</span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase text-slate-400 font-bold block">Input (stdin):</span>
                            <pre className="p-1.5 bg-white rounded border border-slate-200 text-slate-800 whitespace-pre-wrap">{tc.stdin || '(empty)'}</pre>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase text-emerald-600 font-bold block">Expected Output:</span>
                            <pre className="p-1.5 bg-white rounded border border-slate-200 text-emerald-800 whitespace-pre-wrap">{tc.expectedOutput}</pre>
                          </div>
                          {tc.explanation && (
                            <p className="text-[10px] text-slate-500 font-sans italic pt-0.5">{tc.explanation}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl border border-dashed border-slate-200 text-center text-slate-500 text-xs">
                      No visible sample tests configured.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: ADMINISTRATOR-ONLY CONFIDENTIAL VIEW */}
            {previewTab === 'ADMIN' && (
              <div className="space-y-4">
                <div className="p-3 bg-rose-50/70 border border-rose-200/80 rounded-xl text-xs text-rose-900">
                  <strong>Confidential Administrator Data:</strong> Planted bug fixes, hidden tests, and reference solutions are strictly restricted to the backend and never exposed to contestant clients.
                </div>

                {/* Planted Defect Checklist */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-rose-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Bug className="w-3.5 h-3.5 text-rose-600" />
                    <span>Planted Defect Checklist &amp; Reference Repairs ({previewQuestion.plantedBugs?.length || 0})</span>
                  </h4>
                  {previewQuestion.plantedBugs && previewQuestion.plantedBugs.length > 0 ? (
                    <div className="space-y-2">
                      {previewQuestion.plantedBugs.map((bug, idx) => (
                        <div key={idx} className="p-3 rounded-xl bg-rose-50/60 border border-rose-200 text-xs space-y-1.5">
                          <div className="flex items-center justify-between font-bold">
                            <span className="text-rose-950 font-mono">
                              #{idx + 1} {bug.name || bug.key} (Line {bug.lineNumber})
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-200 text-rose-900">
                              {bug.marks ?? 5} Marks
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px]">
                            <div>
                              <span className="text-[10px] uppercase text-rose-600 font-bold block">Faulty Expression:</span>
                              <pre className="p-1.5 bg-white rounded border border-rose-300 text-rose-900 whitespace-pre-wrap">{bug.expression}</pre>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase text-emerald-600 font-bold block">Corrected Fix:</span>
                              <pre className="p-1.5 bg-white rounded border border-emerald-300 text-emerald-900 whitespace-pre-wrap">{bug.correctedExpression || '(not specified)'}</pre>
                            </div>
                          </div>
                          <div className="text-slate-700 text-xs">
                            <strong>Root Cause:</strong> {bug.description}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl border border-dashed border-slate-200 text-center text-slate-500 text-xs">
                      No planted bugs configured.
                    </div>
                  )}
                </div>

                {/* Hidden & Edge-Case Test Suite */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    <span>Hidden &amp; Edge-Case Evaluation Suite ({previewQuestion.hiddenTestCases?.length || 0})</span>
                  </h4>
                  {previewQuestion.hiddenTestCases && previewQuestion.hiddenTestCases.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {previewQuestion.hiddenTestCases.map((tc: any, idx) => (
                        <div key={idx} className="p-3 rounded-xl border border-amber-200 bg-amber-50/40 space-y-1.5 text-xs font-mono">
                          <div className="flex items-center justify-between text-[11px] font-bold text-amber-950">
                            <span>Hidden Test #{idx + 1}</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-200 text-amber-900">
                              {tc.marks || 10} pts {tc.isEdgeCase ? '• Edge Case' : ''}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase text-slate-400 font-bold block">Stdin:</span>
                            <pre className="p-1.5 bg-white rounded border border-amber-200 text-slate-800 whitespace-pre-wrap">{tc.stdin || '(empty)'}</pre>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase text-amber-700 font-bold block">Expected Output:</span>
                            <pre className="p-1.5 bg-white rounded border border-amber-200 text-amber-900 whitespace-pre-wrap">{tc.expectedOutput}</pre>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl border border-dashed border-slate-200 text-center text-slate-500 text-xs">
                      No hidden test cases configured.
                    </div>
                  )}
                </div>

                {/* Internal Benchmark Notes */}
                {previewQuestion.explanation && (
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Internal Solution Notes &amp; Rubric Benchmarks
                    </h4>
                    <pre className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200 font-mono">
                      {previewQuestion.explanation}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="pt-3 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setPreviewModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
