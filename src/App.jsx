
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Plus, Clock, Tag, Zap, Leaf, CheckCircle2,
  History as HistoryIcon, LayoutDashboard, Settings, Trash2,
  X, ChevronDown, ChevronUp, Edit3, ListTodo, RefreshCcw,
  Check, Calendar as CalendarIcon, Quote, Eye, StickyNote,
  MessageSquare, Layers, GripVertical
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from './firebase'; // 確保您有正確設定 firebase.js
import {
  collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp
} from 'firebase/firestore';

// --- 常數定義 ---
const INITIAL_TAGS = [
  { name: '雜項', color: 'bg-stone-300', barColor: 'bg-stone-400' },
  { name: '小週末', color: 'bg-rose-200', barColor: 'bg-rose-400' },
  { name: '實習', color: 'bg-blue-200', barColor: 'bg-blue-400' },
  { name: '學校', color: 'bg-emerald-200', barColor: 'bg-emerald-400' },
  { name: '生活', color: 'bg-amber-100', barColor: 'bg-amber-400' },
];

const COLOR_PALETTE = [
  'bg-stone-300', 'bg-rose-200', 'bg-blue-200', 'bg-emerald-200',
  'bg-amber-100', 'bg-purple-200', 'bg-orange-200', 'bg-cyan-200'
];

const TIME_OPTIONS = Array.from({ length: 16 }, (_, i) => (i + 1) * 30); // 30m to 8h

const DEFAULT_QUOTES = [
  "我們都吞咽了太多意義，其實生活只需要呼吸",
  "也許今天沒有做出什麼成就，但如果我今天比昨天更溫柔一點點，也是很大的進步",
  "允許自己慢慢來，允許自己暫時做不到"
];

// --- Helper Functions ---
const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
};

const formatDateShort = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return `${date.getMonth() + 1}/${date.getDate()}`;
};

const formatDateFull = (date) => {
  if (!date) return '';
  // Handle Firestore Timestamp
  const d = date.toDate ? date.toDate() : new Date(date);
  return d.toISOString().split('T')[0];
};

const formatTimeDisplay = (minutes) => {
  if (!minutes) return '預估時長';
  return minutes < 60 ? `${minutes}m` : `${minutes / 60}h`;
};

// 轉換 Firestore 資料日期物件
const convertDates = (data) => {
  const result = { ...data };
  ['createdAt', 'completedAt', 'deadline'].forEach(field => {
    if (result[field] && result[field].toDate) {
      result[field] = result[field].toDate();
    } else if (result[field]) {
      result[field] = new Date(result[field]);
    }
  });
  if (result.subtasks) {
    result.subtasks = result.subtasks.map(s => {
      const sub = { ...s };
      if (sub.completedAt && sub.completedAt.toDate) {
        sub.completedAt = sub.completedAt.toDate();
      } else if (sub.completedAt) {
        sub.completedAt = new Date(sub.completedAt);
      }
      return sub;
    });
  }
  return result;
};

// --- 小組件：煙火特效 ---
const Celebration = ({ onComplete }) => {
  useEffect(() => {
    const timer = setTimeout(onComplete, 2000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center bg-transparent"
    >
      <div className="relative w-full h-full overflow-hidden">
        {[...Array(30)].map((_, i) => (
          <motion.div
            key={i}
            initial={{
              x: window.innerWidth / 2,
              y: window.innerHeight / 2,
              scale: 0
            }}
            animate={{
              x: (Math.random() - 0.5) * window.innerWidth * 1.2,
              y: (Math.random() - 0.5) * window.innerHeight * 1.2,
              scale: [0, 1.5, 0],
              opacity: [1, 1, 0],
              rotate: Math.random() * 360
            }}
            transition={{ duration: 1.5, ease: "easeOut", delay: Math.random() * 0.2 }}
            className={`absolute w-3 h-3 rounded-full ${['bg-rose-300', 'bg-amber-200', 'bg-blue-300', 'bg-emerald-200'][i % 4]}`}
          />
        ))}
      </div>
    </motion.div>
  );
};

// --- 小組件：自訂下拉選單 ---
const CustomSelect = ({ value, onChange, options, icon: Icon, label, placeholder }) => (
  <div className="space-y-2 relative">
    {label && (
      <label className="text-[10px] text-stone-400 uppercase tracking-widest flex items-center gap-1">
        {Icon && <Icon size={12} />} {label}
      </label>
    )}
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        className={`w-full appearance-none bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm text-stone-600 focus:outline-none focus:ring-1 focus:ring-stone-300 pr-10 ${value === '' ? 'text-stone-400' : ''} h-12`}
      >
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-stone-400">
        <ChevronDown size={14} />
      </div>
    </div>
  </div>
);

// --- 小組件：時間選擇器 ---
const TimePicker = ({ value, onChange, disabled, label, placeholder }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="space-y-2 relative" ref={containerRef}>
      {label && (
        <label className="text-[10px] text-stone-400 uppercase tracking-widest flex items-center gap-1">
          <Clock size={12} /> {label}
        </label>
      )}
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-center gap-1 px-4 rounded-xl border text-sm transition-all h-12 ${disabled ? 'bg-stone-50 text-stone-400 border-stone-100 cursor-not-allowed' : 'bg-white border-stone-200 text-stone-600 hover:border-stone-300'}`}
      >
        <span>{value ? formatTimeDisplay(value) : (placeholder || "預估時長")}</span>
        {!disabled && !value && <ChevronDown size={14} className="text-stone-400" />}
      </button>

      {isOpen && !disabled && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-stone-100 rounded-xl shadow-xl z-50 p-2 grid grid-cols-4 gap-1 max-h-60 overflow-y-auto">
          {TIME_OPTIONS.map(t => (
            <button
              key={t}
              onClick={() => { onChange(t); setIsOpen(false); }}
              className={`py-1.5 rounded-lg text-xs hover:bg-stone-50 ${value === t ? 'bg-stone-100 font-bold text-stone-700' : 'text-stone-500'}`}
            >
              {t < 60 ? `${t}m` : `${t / 60}h`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// --- 小組件：純視覺時間條 ---
const TimeBar = ({ minutes, colorClass }) => {
  if (!minutes) return null;
  const maxMinutes = 240;
  const percentage = Math.min((minutes / maxMinutes) * 100, 100);

  return (
    <div className="flex items-center gap-2" title={`${minutes} 分鐘`}>
      <div
        className={`h-1.5 ${colorClass} opacity-80 rounded-full transition-all duration-500`}
        style={{ width: `${Math.max(percentage, 5)}px`, minWidth: '10px', maxWidth: '100px' }}
      ></div>
    </div>
  );
};

// --- 小組件：可展開的備註 ---
const ExpandableNote = ({ text }) => {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;

  const display = expanded ? text : (text.length > 10 ? text.substring(0, 10) + '...' : text);

  return (
    <button
      onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
      className="text-xs text-stone-400 hover:text-stone-600 bg-stone-50 px-2 py-0.5 rounded flex items-center gap-1 transition-colors text-left"
    >
      <MessageSquare size={10} />
      <span className="ml-1">{display}</span>
    </button>
  );
};

// --- 小組件：任務資訊橫排 ---
const TaskInfoRow = ({ title, deadline, energy, estTime, tagColor, note }) => (
  <div className="flex items-center gap-2 overflow-hidden w-full">
    <span className="text-stone-700 font-medium leading-tight truncate flex-shrink-0">{title}</span>
    <div className="flex items-center gap-2 flex-shrink-0">
      {deadline && (
        <span className="text-[10px] text-rose-400 font-sans bg-rose-50 px-1.5 py-0.5 rounded whitespace-nowrap">
          {formatDateShort(deadline)}
        </span>
      )}
      {(energy) && (
        <div className="w-4 flex justify-center">
          {energy === 'high' ? <Zap size={14} className="text-amber-400" /> : <Leaf size={14} className="text-emerald-400" />}
        </div>
      )}
      {estTime && (
        <span className="text-[10px] text-stone-400 font-mono whitespace-nowrap">
          {estTime < 60 ? `${estTime}m` : `${estTime / 60}h`}
        </span>
      )}
      {estTime && <TimeBar minutes={estTime} colorClass={tagColor} />}
      <ExpandableNote text={note} />
    </div>
  </div>
);

// --- 主要應用程式 ---
export default function App() {
  const [view, setView] = useState('dashboard');
  const [tasks, setTasks] = useState([]);
  const [tags, setTags] = useState([]);
  const [quotes, setQuotes] = useState([]);

  const [showCelebration, setShowCelebration] = useState(false);

  // 語錄
  const [activeQuoteMode, setActiveQuoteMode] = useState('random');
  const [currentQuoteIndex, setCurrentQuoteIndex] = useState(0);
  const [displayQuote, setDisplayQuote] = useState('');
  const [editingQuoteIndex, setEditingQuoteIndex] = useState(null);
  const [newQuoteText, setNewQuoteText] = useState('');

  // 輸入
  const [editingId, setEditingId] = useState(null);
  const [inputTitle, setInputTitle] = useState('');
  const [isTemp, setIsTemp] = useState(true);
  const [isDetailed, setIsDetailed] = useState(false);
  const [selectedTag, setSelectedTag] = useState('');

  // 屬性
  const [estTime, setEstTime] = useState('');
  const [energy, setEnergy] = useState('low');
  const [deadline, setDeadline] = useState('');
  const [note, setNote] = useState('');

  // 子任務
  const [subtasks, setSubtasks] = useState([]);
  const [tempSubName, setTempSubName] = useState('');
  const [tempSubTime, setTempSubTime] = useState('');
  const [tempSubEnergy, setTempSubEnergy] = useState('low');
  const [tempSubDeadline, setTempSubDeadline] = useState('');
  const [tempSubNote, setTempSubNote] = useState('');
  const [isAddingSubtaskMode, setIsAddingSubtaskMode] = useState(false);

  // 拖曳狀態
  const [draggedSubIndex, setDraggedSubIndex] = useState(null);

  // 編輯相關 (子任務)
  const [editingSubtaskId, setEditingSubtaskId] = useState(null);
  const [editSubTitle, setEditSubTitle] = useState('');
  const [editSubTime, setEditSubTime] = useState('');
  const [editSubEnergy, setEditSubEnergy] = useState('low');
  const [editSubDeadline, setEditSubDeadline] = useState('');
  const [editSubNote, setEditSubNote] = useState('');

  // 設定頁面
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(COLOR_PALETTE[0]);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [editingTagId, setEditingTagId] = useState(null);

  // 其他
  const [collapsedTags, setCollapsedTags] = useState({});
  const [isInboxCollapsed, setIsInboxCollapsed] = useState(false);
  const [historyEditItem, setHistoryEditItem] = useState(null);
  const [completingItem, setCompletingItem] = useState(null);

  const inputRef = useRef(null);
  const dateInputRef = useRef(null);
  const detailDateInputRef = useRef(null);
  const subDateInputRef = useRef(null);

  // --- Firestore 監聽 ---
  useEffect(() => {
    const qTasks = query(collection(db, 'tasks'), orderBy('createdAt', 'desc'));
    const unsubscribeTasks = onSnapshot(qTasks, (snapshot) => {
      const taskData = snapshot.docs.map(doc => ({ id: doc.id, ...convertDates(doc.data()) }));
      setTasks(taskData);
    });

    const qTags = query(collection(db, 'tags'), orderBy('createdAt', 'asc'));
    const unsubscribeTags = onSnapshot(qTags, (snapshot) => {
      const tagData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTags(tagData.length > 0 ? tagData : []);
    });

    const qQuotes = query(collection(db, 'quotes'), orderBy('createdAt', 'asc'));
    const unsubscribeQuotes = onSnapshot(qQuotes, (snapshot) => {
      const quoteData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setQuotes(quoteData);
    });

    return () => {
      unsubscribeTasks();
      unsubscribeTags();
      unsubscribeQuotes();
    };
  }, []);

  // 初始化預設值 (如果資料庫是空的)
  useEffect(() => {
    const initData = async () => {
      // 檢查 Tags
      const tagsSnapshot = await db.collection?.('tags').get?.() || { empty: true }; // 簡單防呆
      if (tasks.length === 0 && tags.length === 0 && quotes.length === 0) {
        // 我們讓使用者手動建立，或者這裡可以自動寫入預設值
        // 為了避免重複寫入，這裡先不做自動寫入，除非使用者明確要求
      }
    };
    initData();
  }, []);

  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    const quoteTexts = quotes.length > 0
      ? quotes.map(q => (typeof q === 'object' ? q.text : q))
      : DEFAULT_QUOTES;

    if (activeQuoteMode === 'random') {
      const randomIndex = Math.floor(Math.random() * quoteTexts.length);
      setDisplayQuote(quoteTexts[randomIndex]);
    } else {
      setDisplayQuote(quoteTexts[currentQuoteIndex] || quoteTexts[0]);
    }
  }, [activeQuoteMode, currentQuoteIndex, quotes, view]);

  // --- 功能邏輯 ---

  const resetInput = () => {
    setEditingId(null);
    setInputTitle('');
    setIsTemp(true);
    setIsDetailed(false);
    setSubtasks([]);
    setNote('');
    setDeadline('');
    setEstTime('');
    setEnergy('low');
    setSelectedTag('');
    setIsAddingSubtaskMode(false);
    resetTempSubInput();
  };

  const resetTempSubInput = () => {
    setTempSubName('');
    setTempSubTime('');
    setTempSubEnergy('low');
    setTempSubDeadline('');
    setTempSubNote('');
  };

  const handleSaveTask = async () => {
    if (!inputTitle.trim()) return;
    if (!isTemp && !selectedTag) return;

    const finalSubtasks = isAddingSubtaskMode ? subtasks : [];
    const isContainer = finalSubtasks.length > 0;

    const taskData = {
      title: inputTitle,
      isTemp: isTemp,
      tagId: selectedTag || null,
      createdAt: editingId ? (tasks.find(t => t.id === editingId)?.createdAt || new Date()) : serverTimestamp(),
      status: 'pending',
      estTime: isContainer ? null : (estTime === '' ? '' : Number(estTime)),
      energy: isContainer ? null : energy,
      deadline: isContainer ? null : (deadline ? new Date(deadline) : null),
      note: isContainer ? null : note,
      subtasks: finalSubtasks.map(s => ({
        ...s,
        deadline: s.deadline ? new Date(s.deadline) : null
      })),
    };

    try {
      if (editingId) {
        await updateDoc(doc(db, 'tasks', editingId), taskData);
      } else {
        await addDoc(collection(db, 'tasks'), taskData);
      }
    } catch (error) {
      console.error("Error saving task: ", error);
      alert("儲存失敗，請檢查網路連線");
    }

    resetInput();
  };

  const handleEditTask = (task) => {
    setEditingId(task.id);
    setInputTitle(task.title);
    setIsTemp(task.isTemp);
    setIsDetailed(true);
    setSelectedTag(task.tagId);

    // Convert Dates back to string for inputs
    const dStr = task.deadline ? formatDateFull(task.deadline) : '';

    if (task.subtasks && task.subtasks.length > 0) {
      setIsAddingSubtaskMode(true);
      setSubtasks(task.subtasks.map(s => ({
        ...s,
        deadline: s.deadline ? formatDateFull(s.deadline) : ''
      })));
      setEstTime('');
      setEnergy('low');
      setDeadline('');
      setNote('');
    } else {
      setIsAddingSubtaskMode(false);
      setSubtasks([]);
      setEstTime(task.estTime || '');
      setEnergy(task.energy || 'low');
      setDeadline(dStr);
      setNote(task.note || '');
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => inputRef.current?.focus(), 300);
  };

  const addSubtask = () => {
    if (!tempSubName.trim()) return;
    setSubtasks([...subtasks, {
      id: Math.random().toString(36).substr(2, 9),
      title: tempSubName,
      time: tempSubTime === '' ? '' : Number(tempSubTime),
      energy: tempSubEnergy,
      deadline: tempSubDeadline, // Keep as string for now until save
      note: tempSubNote,
      isCompleted: false
    }]);
    resetTempSubInput();
  };

  const removeSubtask = (id) => {
    setSubtasks(subtasks.filter(s => s.id !== id));
  };

  const startEditSubtask = (sub) => {
    setEditingSubtaskId(sub.id);
    setEditSubTitle(sub.title);
    setEditSubTime(sub.time);
    setEditSubEnergy(sub.energy || 'low');
    setEditSubDeadline(sub.deadline || '');
    setEditSubNote(sub.note || '');
  };

  const saveEditSubtask = () => {
    setSubtasks(subtasks.map(s =>
      s.id === editingSubtaskId ? {
        ...s,
        title: editSubTitle,
        time: editSubTime,
        energy: editSubEnergy,
        deadline: editSubDeadline,
        note: editSubNote
      } : s
    ));
    setEditingSubtaskId(null);
  };

  const cancelEditSubtask = () => {
    setEditingSubtaskId(null);
  };

  const initiateCompletion = (type, parentTask, subtask = null) => {
    if (type === 'sub' && subtask.isCompleted) return;
    if (type === 'main' && parentTask.status === 'completed') return;

    setCompletingItem({
      type,
      parentTask,
      subtask,
      completedAt: new Date(),
      reflection: '',
      actualTime: '',
    });
  };

  const confirmCompletion = async () => {
    if (!completingItem) return;

    const { type, parentTask, subtask, completedAt, reflection, actualTime } = completingItem;

    try {
      if (type === 'sub') {
        const newSubtasks = parentTask.subtasks.map(s =>
          s.id === subtask.id ? {
            ...s,
            isCompleted: true,
            completedAt: completedAt,
            reflection: reflection,
            actualTime: actualTime
          } : s
        );
        const allCompleted = newSubtasks.every(s => s.isCompleted);

        await updateDoc(doc(db, 'tasks', parentTask.id), {
          subtasks: newSubtasks,
          status: allCompleted ? 'completed' : 'pending',
          completedAt: allCompleted ? completedAt : (parentTask.completedAt || null)
        });
      } else {
        await updateDoc(doc(db, 'tasks', parentTask.id), {
          status: 'completed',
          completedAt: completedAt,
          reflection: reflection,
          actualTime: actualTime
        });
      }
      setShowCelebration(true);
    } catch (e) {
      console.error(e);
      alert("更新失敗");
    }

    setCompletingItem(null);
  };

  const handleDeleteTask = async (taskId) => {
    if (editingId === taskId) resetInput();
    try {
      await deleteDoc(doc(db, 'tasks', taskId));
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateHistoryItem = async (data) => {
    const item = historyEditItem;
    try {
      if (item.type === 'sub') {
        const parentTask = item.parentTask;
        const newSubtasks = parentTask.subtasks.map(s => s.id === item.data.id ? { ...s, ...data } : s);
        await updateDoc(doc(db, 'tasks', parentTask.id), { subtasks: newSubtasks });
      } else {
        await updateDoc(doc(db, 'tasks', item.data.id), data);
      }
    } catch (e) {
      console.log(e);
    }
    setHistoryEditItem(null);
  };

  const handleSaveTag = async () => {
    if (!newTagName.trim()) return;
    try {
      if (editingTagId) {
        await updateDoc(doc(db, 'tags', editingTagId), { name: newTagName, color: newTagColor });
        setEditingTagId(null);
      } else {
        await addDoc(collection(db, 'tags'), {
          name: newTagName,
          color: newTagColor,
          createdAt: serverTimestamp()
        });
      }
    } catch (e) { console.error(e); }
    setNewTagName('');
    setIsAddingTag(false);
  };

  const handleDeleteTag = async (tagId) => {
    try {
      await deleteDoc(doc(db, 'tags', tagId));
      if (selectedTag === tagId) setSelectedTag('');
    } catch (e) { console.error(e); }
  };

  const handleSaveQuote = async () => {
    if (!newQuoteText.trim()) return;
    try {
      if (editingQuoteIndex !== null && quotes[editingQuoteIndex]?.id) {
        await updateDoc(doc(db, 'quotes', quotes[editingQuoteIndex].id), { text: newQuoteText });
      } else {
        await addDoc(collection(db, 'quotes'), { text: newQuoteText, createdAt: serverTimestamp() });
      }
    } catch (e) { console.error(e); }
    setNewQuoteText('');
    setEditingQuoteIndex(null);
  };

  const handleDeleteQuote = async (index) => {
    const quote = quotes[index];
    if (quote?.id) {
      try {
        await deleteDoc(doc(db, 'quotes', quote.id));
        if (currentQuoteIndex >= index && currentQuoteIndex > 0) setCurrentQuoteIndex(currentQuoteIndex - 1);
      } catch (e) { console.error(e); }
    }
  };

  const handleEditQuote = (index) => {
    setNewQuoteText(quotes[index].text);
    setEditingQuoteIndex(index);
  };


  // --- 渲染前的資料處理 ---
  const activeTasks = tasks.filter(t => t.status === 'pending');
  const tempTasks = activeTasks.filter(t => t.isTemp);
  const normalTasks = activeTasks.filter(t => !t.isTemp);

  const effectiveTags = tags.length > 0 ? tags : INITIAL_TAGS;

  const groupedNormalTasks = useMemo(() => {
    const groups = {};
    effectiveTags.forEach(tag => groups[tag.id] = []);
    normalTasks.forEach(task => {
      const hasActiveSubtasks = task.subtasks && task.subtasks.some(s => !s.isCompleted);
      const isSingleTask = !task.subtasks || task.subtasks.length === 0;

      if (isSingleTask || hasActiveSubtasks) {
        const tagId = task.tagId; // 這裡要注意 tagId 是否吻合
        if (groups[tagId]) groups[tagId].push(task);
        else {
          // 如果找不到 tag (可能是預設的，或是舊資料)，先放 other 或是尋找對應
          // 這裡簡單處理：如果沒 tagId, 放 other
          if (!tagId) {
            if (!groups['other']) groups['other'] = [];
            groups['other'].push(task);
          } else {
            // 嘗試找一下有沒有這個 ID，如果沒有就...
            if (groups[tagId]) groups[tagId].push(task);
            else {
              if (!groups['other']) groups['other'] = [];
              groups['other'].push(task);
            }
          }
        }
      }
    });
    return groups;
  }, [normalTasks, effectiveTags]);

  const groupedHistoryTasks = useMemo(() => {
    const groups = {};
    tasks.forEach(task => {
      if (task.status === 'completed' && (!task.subtasks || task.subtasks.length === 0)) {
        const dateKey = formatDateFull(task.completedAt || new Date());
        if (!groups[dateKey]) groups[dateKey] = [];
        groups[dateKey].push({ type: 'main', data: task, sortDate: task.completedAt });
      }
      if (task.subtasks && task.subtasks.length > 0) {
        const completedSubs = task.subtasks.filter(s => s.isCompleted);
        const subsByDate = {};
        completedSubs.forEach(sub => {
          const dKey = formatDateFull(sub.completedAt || new Date());
          if (!subsByDate[dKey]) subsByDate[dKey] = [];
          subsByDate[dKey].push(sub);
        });
        Object.entries(subsByDate).forEach(([date, subs]) => {
          if (!groups[date]) groups[date] = [];
          groups[date].push({ type: 'grouped-subs', parentTask: task, subs: subs, sortDate: subs[0].completedAt });
        });
      }
    });
    const sortedGroups = {};
    Object.keys(groups).sort((a, b) => new Date(b) - new Date(a)).forEach(key => {
      groups[key].sort((a, b) => new Date(b.sortDate) - new Date(a.sortDate));
      sortedGroups[key] = groups[key];
    });
    return sortedGroups;
  }, [tasks]);

  return (
    <div className="min-h-screen bg-[#F9F8F6] text-stone-800 font-serif pb-20 selection:bg-rose-100">
      <AnimatePresence>
        {showCelebration && <Celebration onComplete={() => setShowCelebration(false)} />}
      </AnimatePresence>

      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white/70 backdrop-blur-xl border border-white/50 px-6 py-3 rounded-full shadow-lg z-40 flex gap-8 items-center">
        <button onClick={() => setView('dashboard')} className={`p-2 rounded-full transition-colors ${view === 'dashboard' ? 'bg-stone-200 text-stone-900' : 'text-stone-400'}`}>
          <LayoutDashboard size={20} />
        </button>
        <button onClick={() => setView('history')} className={`p-2 rounded-full transition-colors ${view === 'history' ? 'bg-stone-200 text-stone-900' : 'text-stone-400'}`}>
          <HistoryIcon size={20} />
        </button>
        <button onClick={() => setView('settings')} className={`p-2 rounded-full transition-colors ${view === 'settings' ? 'bg-stone-200 text-stone-900' : 'text-stone-400'}`}>
          <Settings size={20} />
        </button>
      </nav>

      <main className="max-w-3xl mx-auto px-6 pt-12">

        {view === 'dashboard' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-10 text-center px-4"
          >
            <p className="text-stone-600 font-serif leading-relaxed text-xl tracking-widest whitespace-pre-wrap">
              「{displayQuote}」
            </p>
          </motion.div>
        )}

        {/* 完工反思 Modal (Same as before) -- 保持不變，略為簡化顯示 */}
        <AnimatePresence>
          {(completingItem || historyEditItem) && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/20 backdrop-blur-sm p-4"
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
                className="bg-white w-full max-w-md rounded-3xl shadow-xl overflow-hidden"
              >
                <div className="bg-stone-50 p-4 border-b border-stone-100 flex justify-between items-center">
                  <h3 className="font-bold text-stone-600">紀錄與反思</h3>
                  <button
                    onClick={() => { setCompletingItem(null); setHistoryEditItem(null); }}
                    className="p-1 rounded-full hover:bg-stone-200 text-stone-400"
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="p-6 space-y-6">
                  {(() => {
                    const isHistory = !!historyEditItem;
                    const targetItem = completingItem || historyEditItem;
                    const data = isHistory ? targetItem.data : targetItem;
                    // ... (Reuse previous logic)
                    const title = isHistory
                      ? (targetItem.type === 'sub' ? targetItem.data.title : targetItem.data.title)
                      : (targetItem.type === 'sub' ? targetItem.subtask.title : targetItem.parentTask.title);

                    const updateData = (newData) => {
                      if (isHistory) {
                        setHistoryEditItem({ ...targetItem, data: { ...targetItem.data, ...newData } });
                      } else {
                        setCompletingItem({ ...targetItem, ...newData });
                      }
                    };

                    return (
                      <>
                        <div className="space-y-2">
                          <div className="text-lg text-stone-800 font-medium">{title}</div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="relative h-12">
                            <input
                              type="date"
                              value={data.completedAt ? formatDateFull(data.completedAt) : ''}
                              onChange={(e) => updateData({ completedAt: new Date(e.target.value) })}
                              className="w-full h-full bg-white border border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-600 focus:outline-none"
                            />
                          </div>
                          <div className="relative h-12">
                            <TimePicker
                              value={data.actualTime}
                              onChange={(val) => updateData({ actualTime: val })}
                              disabled={false}
                              placeholder="實際時數"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <textarea
                            value={data.reflection || ''}
                            onChange={(e) => updateData({ reflection: e.target.value })}
                            placeholder="寫下你的感覺..."
                            className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm focus:outline-none min-h-[120px] resize-none"
                          />
                        </div>

                        <button
                          onClick={() => isHistory ? handleUpdateHistoryItem(data) : confirmCompletion()}
                          className="w-full bg-stone-800 text-white py-3 rounded-2xl font-medium shadow-lg active:scale-95 transition-all"
                        >
                          儲存紀錄
                        </button>
                      </>
                    );
                  })()}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {view === 'dashboard' && (
          <section className="mb-12 sticky top-4 z-30">
            <div className={`bg-white/70 backdrop-blur-xl border border-white/60 rounded-3xl shadow-lg transition-all ${editingId ? 'ring-2 ring-rose-200' : ''}`}>
              {/* 輸入框 UI 保持不變，僅省略部分重複代碼以節省空間... 邏輯皆已連結 handleSaveTask */}
              <div className="flex items-center gap-3 px-4 py-3">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputTitle}
                  onChange={(e) => setInputTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                  className="flex-1 bg-transparent border-none outline-none text-lg py-1 pl-3 placeholder-stone-300"
                  placeholder={isTemp ? "" : "輸入任務名稱..."}
                />

                <div className="flex items-center gap-2">
                  <div className="relative group w-9 h-9 flex items-center justify-center">
                    <button className={`flex items-center justify-center w-full h-full rounded-full transition-all relative z-10 ${deadline ? 'bg-rose-50 text-rose-400' : 'bg-stone-100 text-stone-400 hover:bg-stone-200'}`}>
                      <CalendarIcon size={16} />
                    </button>
                    <input ref={dateInputRef} type="date" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20" onChange={(e) => setDeadline(e.target.value)} value={deadline} />
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer select-none px-3 py-1.5 hover:bg-stone-100 rounded-xl transition-colors">
                    <input type="checkbox" checked={isTemp} onChange={(e) => { setIsTemp(e.target.checked); if (!e.target.checked) setIsDetailed(true); else setIsDetailed(false); }} className="w-4 h-4 rounded border-stone-300 text-stone-600 focus:ring-rose-200" />
                    <span className="text-sm text-stone-500">暫存</span>
                  </label>

                  <button onClick={handleSaveTask} disabled={!inputTitle.trim() || (!isTemp && !selectedTag)} className="bg-stone-800 text-white px-5 py-2 rounded-xl text-sm hover:bg-stone-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-md active:scale-95 font-medium">
                    {editingId ? '更新' : '完成'}
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {isDetailed && (
                  <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden border-t border-stone-100">
                    <div className="p-6 space-y-6">
                      {/* ... Tag 選單 ... */}
                      <div className="flex gap-4 items-center">
                        <div className="flex-1">
                          <CustomSelect
                            icon={Tag} value={selectedTag} onChange={(e) => setSelectedTag(e.target.value)} placeholder="選擇分類..."
                            options={effectiveTags.map(t => ({ value: t.id, label: t.name }))}
                          />
                        </div>
                        <button onClick={() => setIsAddingSubtaskMode(!isAddingSubtaskMode)} className={`mt-2 px-4 rounded-xl border text-sm transition-all flex items-center gap-2 h-12 ${isAddingSubtaskMode ? 'bg-stone-800 text-white border-stone-800' : 'bg-white border-stone-200 text-stone-500 hover:bg-stone-50'}`}>
                          <Layers size={14} /> {isAddingSubtaskMode ? '子任務模式' : '單一任務'}
                        </button>
                      </div>
                      {/* ... 細節輸入 ... */}
                      {!isAddingSubtaskMode ? (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <TimePicker value={estTime} onChange={(val) => setEstTime(val)} disabled={false} />
                            <div className="relative h-12">
                              <button onClick={() => detailDateInputRef.current?.showPicker()} className={`w-full h-full flex items-center justify-center gap-2 rounded-xl border text-sm transition-all ${deadline ? 'bg-rose-50 border-rose-200 text-rose-500' : 'bg-white border-stone-200 text-stone-600'}`}>
                                <CalendarIcon size={14} /> {deadline ? formatDateShort(deadline) : "截止日"}
                              </button>
                              <input ref={detailDateInputRef} type="date" className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" onChange={(e) => setDeadline(e.target.value)} value={deadline} />
                            </div>
                            <button onClick={() => setEnergy('high')} className={`h-12 rounded-xl border text-sm transition-all flex items-center justify-center gap-2 ${energy === 'high' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-stone-200 text-stone-400'}`}><Zap size={14} /> 高專注</button>
                            <button onClick={() => setEnergy('low')} className={`h-12 rounded-xl border text-sm transition-all flex items-center justify-center gap-2 ${energy === 'low' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-stone-200 text-stone-400'}`}><Leaf size={14} /> 低耗能</button>
                          </div>
                          <div className="space-y-2"><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="備註..." className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm focus:outline-none min-h-[80px] resize-none" /></div>
                        </motion.div>
                      ) : (
                        /* 子任務輸入界面 */
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                          {subtasks.length > 0 && (
                            <div className="space-y-2 mb-4">
                              {subtasks.map((sub, index) => (
                                <div
                                  key={sub.id}
                                  draggable
                                  onDragStart={() => setDraggedSubIndex(index)}
                                  onDragOver={(e) => {
                                    e.preventDefault();
                                    if (draggedSubIndex !== null && draggedSubIndex !== index) {
                                      const newSubs = [...subtasks];
                                      const item = newSubs.splice(draggedSubIndex, 1)[0];
                                      newSubs.splice(index, 0, item);
                                      setSubtasks(newSubs);
                                      setDraggedSubIndex(index);
                                    }
                                  }}
                                  className="bg-white border border-stone-100 p-2.5 rounded-lg flex items-center justify-between text-sm cursor-move active:bg-stone-50"
                                >
                                  {editingSubtaskId === sub.id ? (
                                    <div className="flex-1 space-y-3">
                                      <input value={editSubTitle} onChange={(e) => setEditSubTitle(e.target.value)} className="w-full border-b border-stone-200 outline-none text-base py-1" placeholder="子任務名稱" autoFocus />
                                      <div className="grid grid-cols-2 gap-2">
                                        <TimePicker value={editSubTime} onChange={setEditSubTime} disabled={false} />
                                        <div className="relative h-12"><button className={`w-full h-full flex items-center justify-center gap-2 rounded-xl border text-sm bg-white border-stone-200 text-stone-600`}><CalendarIcon size={14} /> {editSubDeadline ? formatDateShort(editSubDeadline) : "截止日"}</button><input type="date" className="absolute inset-0 opacity-0 w-full h-full" onChange={(e) => setEditSubDeadline(e.target.value)} value={editSubDeadline} /></div>
                                        <button onClick={() => setEditSubEnergy('high')} className={`h-12 rounded-xl border text-xs flex items-center justify-center gap-1 ${editSubEnergy === 'high' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-stone-200 text-stone-400'}`}>⚡️ 高專注</button>
                                        <button onClick={() => setEditSubEnergy('low')} className={`h-12 rounded-xl border text-xs flex items-center justify-center gap-1 ${editSubEnergy === 'low' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-stone-200 text-stone-400'}`}>🍃 低耗能</button>
                                      </div>
                                      <input value={editSubNote} onChange={(e) => setEditSubNote(e.target.value)} placeholder="備註..." className="w-full px-3 h-10 rounded-lg border border-stone-200 text-xs outline-none bg-stone-50" />
                                      <div className="flex justify-end gap-2 pt-1"><button onClick={saveEditSubtask} className="p-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100"><Check size={16} /></button><button onClick={cancelEditSubtask} className="p-2 rounded-lg bg-stone-100 text-stone-500 hover:bg-stone-200"><X size={16} /></button></div>
                                    </div>
                                  ) : (
                                    <>
                                      <div className="mr-2 text-stone-300"><GripVertical size={14} /></div>
                                      <div className="flex-1"><TaskInfoRow title={sub.title} deadline={sub.deadline} energy={sub.energy} estTime={sub.time} tagColor="bg-stone-300" note={sub.note} /></div>
                                      <div className="flex gap-1 ml-2"><button onClick={() => startEditSubtask(sub)} className="text-stone-300 hover:text-stone-500"><Edit3 size={14} /></button><button onClick={() => removeSubtask(sub.id)} className="text-stone-300 hover:text-rose-400"><X size={14} /></button></div>
                                    </>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="bg-stone-50 p-4 rounded-xl border border-stone-100 space-y-4">
                            <div className="flex gap-2"><input value={tempSubName} onChange={(e) => setTempSubName(e.target.value)} placeholder="子任務名稱" className="flex-1 px-3 h-12 rounded-xl border border-stone-200 text-sm outline-none" /><button onClick={addSubtask} disabled={!tempSubName.trim()} className="bg-stone-200 text-stone-600 px-3 h-12 rounded-xl hover:bg-stone-300 disabled:opacity-50"><Plus size={16} /></button></div>
                            <div className="grid grid-cols-2 gap-4">
                              <TimePicker value={tempSubTime} onChange={(val) => setTempSubTime(val)} disabled={false} placeholder="預估時間" />
                              <div className="relative h-12"><button onClick={() => subDateInputRef.current?.showPicker()} className={`w-full h-full bg-white border border-stone-200 rounded-xl text-xs flex items-center justify-center gap-1 ${tempSubDeadline ? 'text-rose-500' : 'text-stone-600'}`}>{tempSubDeadline ? formatDateShort(tempSubDeadline) : "截止日"}</button><input ref={subDateInputRef} type="date" className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" onChange={(e) => setTempSubDeadline(e.target.value)} value={tempSubDeadline} /></div>
                              <button onClick={() => setTempSubEnergy('high')} className={`h-12 rounded-xl border text-xs flex items-center justify-center gap-1 ${tempSubEnergy === 'high' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-stone-200 text-stone-400'}`}>⚡️ 高專注</button>
                              <button onClick={() => setTempSubEnergy('low')} className={`h-12 rounded-xl border text-xs flex items-center justify-center gap-1 ${tempSubEnergy === 'low' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-stone-200 text-stone-400'}`}>🍃 低耗能</button>
                            </div>
                            <input value={tempSubNote} onChange={(e) => setTempSubNote(e.target.value)} placeholder="子任務備註..." className="w-full px-3 h-12 rounded-xl border border-stone-200 text-xs outline-none bg-white" />
                          </div>
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </section>
        )}

        {/* 列表顯示 */}
        {view === 'dashboard' && (
          <section className="space-y-10 pb-20">
            {/* 暫存區 */}
            {tempTasks.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1 cursor-pointer group" onClick={() => setIsInboxCollapsed(!isInboxCollapsed)}>
                  <div className="w-1.5 h-1.5 rounded-full bg-stone-400"></div><h3 className="text-sm font-bold text-stone-400 tracking-widest uppercase">暫存收集</h3>
                </div>
                {!isInboxCollapsed && <div className="grid gap-2">{tempTasks.map(task => (
                  <div key={task.id} className="bg-white/80 border border-stone-200 rounded-xl p-3 flex flex-col justify-center shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0 cursor-pointer flex items-center gap-2" onClick={() => handleEditTask(task)}>
                        <TaskInfoRow title={task.title} deadline={task.deadline} energy={null} estTime={task.estTime} tagColor="bg-stone-300" note={task.note} />
                      </div>
                      <button onClick={() => handleDeleteTask(task.id)} className="text-stone-300 hover:text-rose-400 p-1"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}</div>}
              </div>
            )}

            {/* 分類任務區 */}
            {effectiveTags.map((tag) => {
              const tagTasks = groupedNormalTasks[tag.id] || [];
              if (tagTasks.length === 0) return null;
              const isCollapsed = collapsedTags[tag.id];
              return (
                <div key={tag.id} className="space-y-4">
                  <div className="flex items-center gap-3 group cursor-pointer" onClick={() => setCollapsedTags({ ...collapsedTags, [tag.id]: !isCollapsed })}>
                    <div className={`w-2 h-6 rounded-full ${tag.color}`}></div><h3 className="text-lg font-bold text-stone-600 tracking-wide">{tag.name}</h3>
                  </div>
                  {!isCollapsed && <div className="grid gap-3">
                    {tagTasks.map(task => (
                      <div key={task.id} className="relative group bg-white border border-stone-100 rounded-2xl shadow-sm hover:shadow-md transition-all flex flex-col justify-center">
                        <div className={`absolute left-0 top-0 bottom-0 w-2 ${tag.color} opacity-40 group-hover:opacity-100 transition-opacity rounded-l-2xl`}></div>
                        <div className="p-4 pl-6 flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4 flex-1 min-w-0">
                              {(!task.subtasks || task.subtasks.length === 0) && <button onClick={() => initiateCompletion('main', task)} className="w-5 h-5 rounded-full border-2 border-stone-200 flex items-center justify-center hover:bg-stone-50 hover:border-rose-300 transition-all text-transparent hover:text-rose-300 flex-shrink-0"><CheckCircle2 size={14} /></button>}
                              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleEditTask(task)}>
                                <TaskInfoRow title={task.title} deadline={task.deadline} energy={task.energy} estTime={task.estTime} tagColor={tag.barColor} note={task.note} />
                              </div>
                            </div>
                            <button onClick={() => handleDeleteTask(task.id)} className="p-1.5 text-stone-300 hover:text-rose-400 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 size={14} /></button>
                          </div>
                          {/* 子任務渲染 */}
                          {task.subtasks && task.subtasks.some(s => !s.isCompleted) && (
                            <div className="mt-2 pl-2 space-y-1.5">
                              {task.subtasks.filter(s => !s.isCompleted).map(sub => (
                                <div key={sub.id} className="flex flex-col text-xs bg-stone-50/80 px-3 py-2 rounded-lg border border-stone-100/50">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0">
                                      <button onClick={() => initiateCompletion('sub', task, sub)} className="w-4 h-4 rounded-full border border-stone-300 hover:border-rose-300 flex-shrink-0"></button>
                                      <TaskInfoRow title={sub.title} deadline={sub.deadline} energy={sub.energy} estTime={sub.time} tagColor={tag.barColor} note={sub.note} />
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>}
                </div>
              );
            })}
          </section>
        )}

        {view === 'history' && (
          <section className="space-y-8 pb-20">
            <header className="mb-8"><h2 className="text-3xl font-bold text-stone-700">歷史累積</h2></header>
            {Object.keys(groupedHistoryTasks).length === 0 ? <div className="text-center text-stone-400 py-10">尚無完成紀錄</div> :
              Object.entries(groupedHistoryTasks).map(([date, items]) => (
                <div key={date} className="relative pl-6 border-l-2 border-stone-200 mb-8">
                  <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-stone-300 border-4 border-[#F9F8F6]"></div>
                  <h3 className="text-lg font-serif font-bold text-stone-600 mb-4 pl-2">{new Date(date).toLocaleDateString()}</h3>
                  <div className="space-y-3">
                    {items.map((item, idx) => {
                      const isGroup = item.type === 'grouped-subs';
                      const parentTask = isGroup ? item.parentTask : item.data;
                      const tag = effectiveTags.find(t => t.id === parentTask.tagId);
                      return (
                        <div key={idx} className="bg-white border border-stone-100 rounded-xl overflow-hidden p-3 shadow-sm relative">
                          <div className={`absolute left-0 top-0 bottom-0 w-2 ${tag?.color || 'bg-stone-200'} opacity-40 rounded-l-2xl`}></div>
                          <div className="pl-4">
                            {isGroup && <div className="mb-2"><span className="text-stone-700 font-bold">{parentTask.title}</span></div>}
                            <div className={isGroup ? "space-y-1 border-l border-stone-100 ml-1 pl-3" : ""}>
                              {(isGroup ? item.subs : [item.data]).map(sub => (
                                <div key={sub.id} className="flex items-center justify-between py-1">
                                  <span className="text-stone-600">{sub.title}</span>
                                  <div className="flex items-center gap-2">
                                    {sub.actualTime && <span className="text-xs text-stone-400 font-mono">{sub.actualTime}m</span>}
                                    {sub.reflection && <ExpandableNote text={sub.reflection} />}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            }
          </section>
        )}

        {view === 'settings' && (
          <section className="space-y-8 pb-20">
            <h2 className="text-3xl font-bold text-stone-700">設定</h2>
            <div className="bg-white rounded-3xl p-6 border border-stone-100 space-y-6 shadow-sm">
              <h4 className="text-xs font-bold text-stone-400 mb-4 uppercase tracking-widest">語錄管理</h4>

              <div className="mb-8">
                <label className="text-[10px] text-stone-400 uppercase tracking-widest mb-2 block">首頁顯示預覽 (可直接編輯)</label>
                <div className="text-center px-4 py-8 bg-[#F9F8F6] rounded-2xl border border-stone-100 relative group">
                  <textarea value={newQuoteText || (editingQuoteIndex !== null ? quotes[editingQuoteIndex]?.text : "")} onChange={(e) => { setNewQuoteText(e.target.value); }} className="w-full bg-transparent border-none text-center text-stone-600 font-serif leading-relaxed text-xl tracking-widest resize-none focus:outline-none" rows={3} placeholder={editingQuoteIndex !== null ? "" : "輸入新語錄"} />
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"><Eye size={16} className="text-stone-300" /></div>
                </div>
              </div>

              <div className="flex gap-1 p-1 bg-stone-100 rounded-xl w-fit mb-4">
                <button onClick={() => setActiveQuoteMode('random')} className={`px-4 py-1.5 rounded-lg text-xs transition-all flex items-center gap-2 ${activeQuoteMode === 'random' ? 'bg-white shadow-sm font-bold text-stone-800' : 'text-stone-400'}`}><RefreshCcw size={12} /> 隨機輪播</button>
                <button onClick={() => setActiveQuoteMode('fixed')} className={`px-4 py-1.5 rounded-lg text-xs transition-all flex items-center gap-2 ${activeQuoteMode === 'fixed' ? 'bg-white shadow-sm font-bold text-stone-800' : 'text-stone-400'}`}><Check size={12} /> 指定顯示</button>
              </div>

              <div className="space-y-3">
                {quotes.map((quote, idx) => (
                  <div key={quote.id || idx} className="flex items-start gap-3 group">
                    <button onClick={() => { setCurrentQuoteIndex(idx); setActiveQuoteMode('fixed'); }} className={`mt-1 w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${activeQuoteMode === 'fixed' && currentQuoteIndex === idx ? 'border-rose-300 bg-rose-50 text-rose-400' : 'border-stone-200 text-transparent'}`}><div className="w-2 h-2 rounded-full bg-current"></div></button>
                    <p className="text-sm text-stone-600 flex-1 font-serif">「{quote.text || quote}」</p>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { handleEditQuote(idx); }} className="text-stone-300 hover:text-stone-500 p-1"><Edit3 size={14} /></button>
                      <button onClick={() => handleDeleteQuote(idx)} className="text-stone-300 hover:text-rose-400 p-1"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-2 border-t border-stone-50">
                <button onClick={handleSaveQuote} disabled={!newQuoteText.trim()} className="w-full bg-stone-800 text-white px-4 py-3 rounded-xl text-sm disabled:opacity-50">{editingQuoteIndex !== null ? "儲存更新" : "新增為新語錄"}</button>
                {editingQuoteIndex !== null && <button onClick={() => { setEditingQuoteIndex(null); setNewQuoteText(''); }} className="bg-stone-100 text-stone-500 px-4 rounded-xl text-sm">取消</button>}
              </div>
            </div>

            <div className="bg-white rounded-3xl p-6 border border-stone-100 space-y-6 shadow-sm">
              <div>
                <h4 className="text-xs font-bold text-stone-400 mb-4 uppercase tracking-widest flex items-center justify-between">標籤管理</h4>
                <div className="grid gap-3">
                  {effectiveTags.map(tag => (
                    <div key={tag.id} className="flex items-center justify-between p-3 bg-stone-50 rounded-2xl group border border-transparent hover:border-stone-100 transition-all">
                      <div className="flex items-center gap-3">
                        <div className={`w-6 h-6 rounded-full ${tag.color} shadow-inner`}></div>
                        <span className="text-stone-700 font-medium">{tag.name}</span>
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                        <button onClick={() => { setNewTagName(tag.name); setNewTagColor(tag.color); setEditingTagId(tag.id); setIsAddingTag(true); }} className="text-stone-300 hover:text-stone-600 p-2"><Edit3 size={16} /></button>
                        {tags.length > 1 && <button onClick={() => handleDeleteTag(tag.id)} className="text-stone-300 hover:text-rose-400 p-2"><Trash2 size={16} /></button>}
                      </div>
                    </div>
                  ))}
                  {isAddingTag ? (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-white border border-stone-200 rounded-2xl p-4 space-y-4 shadow-sm">
                      <div className="space-y-2"><label className="text-xs text-stone-400">{editingTagId ? '編輯標籤名稱' : '新標籤名稱'}</label><input type="text" value={newTagName} onChange={(e) => setNewTagName(e.target.value)} placeholder="例如：運動、閱讀..." className="w-full border-b border-stone-200 py-1 text-stone-700 focus:outline-none focus:border-stone-400" autoFocus /></div>
                      <div className="space-y-2"><label className="text-xs text-stone-400">選擇顏色</label><div className="flex gap-2 flex-wrap">{COLOR_PALETTE.map(color => (<button key={color} onClick={() => setNewTagColor(color)} className={`w-6 h-6 rounded-full ${color} ${newTagColor === color ? 'ring-2 ring-stone-400 ring-offset-2' : ''}`} />))}</div></div>
                      <div className="flex gap-2 pt-2"><button onClick={handleSaveTag} disabled={!newTagName.trim()} className="flex-1 bg-stone-800 text-white py-2 rounded-xl text-sm hover:bg-stone-700 disabled:opacity-50">{editingTagId ? '儲存變更' : '確認新增'}</button><button onClick={() => { setIsAddingTag(false); setEditingTagId(null); setNewTagName(''); }} className="flex-1 bg-stone-100 text-stone-500 py-2 rounded-xl text-sm hover:bg-stone-200">取消</button></div>
                    </motion.div>
                  ) : (
                    <button onClick={() => { setIsAddingTag(true); setNewTagName(''); setNewTagColor(COLOR_PALETTE[0]); setEditingTagId(null); }} className="w-full py-3 border-2 border-dashed border-stone-100 rounded-2xl text-stone-400 text-sm hover:bg-stone-50 hover:border-stone-200 transition-all flex items-center justify-center gap-2 hover:text-stone-600"><Plus size={16} /> 新增標籤</button>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

      </main>

      <footer className="mt-20 py-10 text-center opacity-30 select-none">
        <p className="text-[10px] font-serif italic tracking-widest text-stone-400">Life Blocks</p>
      </footer>
    </div>
  );
}
