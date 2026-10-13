'use client';

import {useEffect, useMemo, useRef, useState} from 'react';
import {BookOpen, ChevronDown, FileText, Search} from 'lucide-react';
import styles from './knowledge-inventory.module.css';

type Unit = {
  id: string; section: string; sourcePage: number; text: string;
  priority: string; priorityBasis: string; qualityFlags: string[]; visualVerified: boolean;
};
type Lecture = {
  documentId: string; course: string; lecture: string; sourceFile: string; pages: number;
  objectiveCandidates: number; contentCandidates: number; basisCounts: Record<string, number>;
  dataUrl: string; bytes: number;
};
type Inventory = {
  generatedAt: string;
  totals: {documents: number; objectiveCandidates: number; contentCandidates: number};
  lectures: Lecture[];
};
type LectureData = {documentId: string; objectives: Unit[]; candidates: Unit[]};
type VerifiedCard = {id: string; title: string; source: {verified?: boolean; file: string; pages: number[]}};
type Props = {search: string; cards: VerifiedCard[]; onViewCards: () => void; onViewSource: (card: VerifiedCard) => void};

const labels: Record<string, {name: string; detail: string}> = {
  teacher_exam_label_on_same_page: {name: '同页有考试标记', detail: '提取文本检测到同页的 EXAM CONTENT 标记；标记适用范围仍需核对，不能推断每条内容都会考。'},
  stated_learning_objective: {name: '课件学习目标', detail: '来自课件 Learning objectives，表示教学范围，不是具体考题或考试概率。'},
  lecture_emphasis_needs_visual_check: {name: '课件强调线索 · 待核对', detail: '根据提取文本中的强调或总结线索排序；需要查看原页确认，不等于老师指定考试重点。'},
  ai_estimate_core_content: {name: 'AI 判断为核心内容', detail: 'AI 根据定义、机制或临床内容给出的整理优先级；不代表老师指定重点或考试概率。'},
  explicitly_deemphasized_or_reference: {name: '参考 / 非重点提示', detail: '提取文本出现参考或非重点提示；其作用范围仍需按原页上下文核对。'},
  no_specific_exam_signal: {name: '暂无明确优先依据', detail: '提取文本中没有可靠的优先级依据；不能据此判断内容不重要。'},
};
const count = (n: number) => n.toLocaleString('zh-CN');
const courseName = (course: string) => course === '.codex-review-hepatic' ? 'Hepatic encephalopathy · 补充讲义' : course === 'general pathology' ? 'General pathology · 普通病理学' : course;
const basis = (name: string) => labels[name] || {name: '整理依据待核对', detail: '尚未识别到可靠的整理依据，请查看原始课件。'};

export default function KnowledgeInventory({search, cards, onViewCards, onViewSource}: Props) {
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [course, setCourse] = useState('all');
  const [visible, setVisible] = useState(12);
  const [active, setActive] = useState<string | null>(null);
  const [lectureData, setLectureData] = useState<LectureData | null>(null);
  const [lectureError, setLectureError] = useState('');
  const [lectureRetry, setLectureRetry] = useState(0);
  const cache = useRef(new Map<string, LectureData>());
  const verifiedCards = cards.filter(card => card.source.verified);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/catalog?key=index.json', {signal: controller.signal})
      .then(async response => {if (!response.ok) throw new Error('候选目录暂时无法读取'); return response.json() as Promise<Inventory>;})
      .then(data => {if (!controller.signal.aborted) setInventory(data);})
      .catch((cause: Error) => {if (cause.name !== 'AbortError') setError(cause.message);});
    return () => controller.abort();
  }, [retry]);

  useEffect(() => {
    if (!active || !inventory) return;
    const lecture = inventory.lectures.find(item => item.documentId === active);
    if (!lecture) return;
    const cached = cache.current.get(lecture.dataUrl);
    const controller = new AbortController();
    const request = cached ? Promise.resolve(cached) : fetch(lecture.dataUrl, {signal: controller.signal})
      .then(async response => {if (!response.ok) throw new Error('这一讲的候选内容未能加载'); return response.json() as Promise<LectureData>;});
    request
      .then(data => {if (controller.signal.aborted) return; if (data.documentId !== active) throw new Error('课件索引版本不一致，请重新加载'); cache.current.set(lecture.dataUrl, data); setLectureData(data);})
      .catch((cause: Error) => {if (cause.name !== 'AbortError') setLectureError(cause.message);});
    return () => controller.abort();
  }, [active, inventory, lectureRetry]);

  const matching = useMemo(() => inventory?.lectures.filter(lecture =>
    (course === 'all' || lecture.course === course) && `${lecture.lecture} ${lecture.course} ${courseName(lecture.course)} ${lecture.sourceFile}`.toLowerCase().includes(search.trim().toLowerCase())
  ) || [], [inventory, course, search]);

  if (!inventory) return <section className={styles.panel} aria-live="polite">
    <p>{error || '正在加载候选目录…'}</p>
    {error && <button onClick={() => {setError(''); setRetry(value => value + 1);}}>重新加载目录</button>}
  </section>;

  return <section className={styles.inventory} aria-label="完整课件候选知识库">
    <div className={styles.overview}>
      <div className={styles.heading}><FileText size={22} aria-hidden="true"/><h2>全部课件，先形成候选</h2></div>
      <div className={styles.stats}>
        <div><strong>{count(inventory.totals.documents)}</strong><span>已索引 PDF</span></div>
        <div><strong>{count(inventory.totals.objectiveCandidates)}</strong><span>学习目标条目</span></div>
        <div><strong>{count(inventory.totals.contentCandidates)}</strong><span>内容摘录片段</span></div>
      </div>
      <p>这是机器拆分的候选清单，可能有重复、断句或图表遗漏；数量不等于独立知识点数，也不代表已学或已核验。</p>
      <div className={styles.verified}><div><strong>{count(verifiedCards.length)} 张已核验互动卡片</strong><span>候选片段整理、核验并确认学过后，才进入复习。</span></div><button onClick={onViewCards}>查看互动卡片</button></div>
    </div>
    <details className={styles.explainer}>
      <summary>整理优先级依据怎么看？</summary>
      <p>优先级帮助安排核对顺序，不表示考试概率。以下依据会在每条候选内容旁显示。</p>
      <dl>{Object.entries(labels).map(([key, value]) => <div key={key}><dt>{value.name}</dt><dd>{value.detail}</dd></div>)}</dl>
    </details>
    <div className={styles.controls}>
      <label>按课程 / 文件夹<select value={course} onChange={event => {setCourse(event.target.value); setVisible(12); setActive(null);}}><option value="all">全部课程 · {inventory.totals.documents} 份</option>{[...new Set(inventory.lectures.map(lecture => lecture.course))].map(name => <option key={name} value={name}>{courseName(name)}</option>)}</select></label>
      <p>上方搜索用于课件名称；打开一讲后可搜索该讲的候选内容。只加载你打开的讲次。</p>
    </div>
    <p className={styles.resultCount} role="status">找到 {matching.length} 份课件{search.trim() ? ` · “${search.trim()}”` : ''}</p>
    {!matching.length && <div className={styles.panel}><p>没有匹配的课件。试试英文名称中的一两个词，或切换到全部课程。</p></div>}
    <div className={styles.lectureList}>
      {matching.slice(0, visible).map(lecture => {
        const expanded = active === lecture.documentId;
        const lectureCards = verifiedCards.filter(card => card.id.startsWith(`${lecture.documentId}:`));
        return <article className={styles.lecture} key={lecture.documentId}>
          <h3><button className={styles.lectureToggle} aria-expanded={expanded} aria-controls={`inventory-${lecture.documentId}`} onClick={() => {setActive(expanded ? null : lecture.documentId); setLectureError('');}}>
            <span><span className={styles.course}>{courseName(lecture.course)}</span><span className={styles.lectureTitle}>{lecture.lecture}</span><span className={styles.lectureMeta}>{lecture.pages} 页 · {lecture.objectiveCandidates} 条目标 · {lecture.contentCandidates} 个内容片段{lectureCards.length > 0 ? ` · ${lectureCards.length} 张互动卡片` : ''}</span></span><ChevronDown size={20} className={expanded ? styles.rotated : undefined} aria-hidden="true"/>
          </button></h3>
          {expanded && <div id={`inventory-${lecture.documentId}`} className={styles.lectureBody}>
            {lectureError ? <div role="alert"><p>{lectureError}。其他课件和已保存的复习进度不受影响。</p><button onClick={() => {setLectureError(''); setLectureRetry(value => value + 1);}}>重试这一讲</button></div> : lectureData?.documentId === lecture.documentId ? <LectureContents key={lecture.documentId} lecture={lecture} data={lectureData} cards={lectureCards} onViewSource={onViewSource}/> : <p role="status">正在加载这一讲的候选内容…</p>}
          </div>}
        </article>;
      })}
    </div>
    {matching.length > visible && <button className={styles.more} onClick={() => setVisible(value => value + 12)}>再显示 {Math.min(12, matching.length - visible)} 份课件 <span>还剩 {matching.length - visible} 份</span></button>}
    <p className={styles.updated}>候选清单更新：{new Date(inventory.generatedAt).toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'})} · 北京时间</p>
  </section>;
}

function LectureContents({lecture, data, cards, onViewSource}: {lecture: Lecture; data: LectureData; cards: VerifiedCard[]; onViewSource: Props['onViewSource']}) {
  const [kind, setKind] = useState(data.objectives.length ? 'objectives' : 'candidates');
  const [query, setQuery] = useState('');
  const [priority, setPriority] = useState('all');
  const [visible, setVisible] = useState(8);
  const units = kind === 'objectives' ? data.objectives : data.candidates;
  const matching = units.filter(unit => (priority === 'all' || unit.priorityBasis === priority) && `${unit.text} ${unit.section} ${unit.sourcePage}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <>
    <p className={styles.sourceFile}><FileText size={16} aria-hidden="true"/>{lecture.sourceFile}</p>
    <p className={styles.warning}>候选摘录尚未逐条核验。图表、文字顺序、缩写及符号需要对照原页；浏览本清单不会确认学习或完成复习。</p>
    {cards.length > 0 && <details className={styles.relatedCards}><summary><BookOpen size={16} aria-hidden="true"/>本讲已有 {cards.length} 张核验互动卡片</summary><div>{cards.map(card => <button key={card.id} onClick={() => onViewSource(card)}>{card.title}<span>PDF 第 {card.source.pages.join('、')} 页 · 查看已核验来源</span></button>)}</div></details>}
    <div className={styles.kindTabs} aria-label="候选类型">{[['objectives', `Learning objectives · ${data.objectives.length}`], ['candidates', `内容片段 · ${data.candidates.length}`]].map(([value, label]) => <button key={value} aria-pressed={kind === value} className={kind === value ? styles.selected : ''} onClick={() => {setKind(value); setPriority('all'); setVisible(8);}}>{label}</button>)}</div>
    <label className={styles.search}><Search size={18} aria-hidden="true"/><input aria-label={`搜索${lecture.lecture}的候选内容`} placeholder="搜索这一讲的内容、章节或页码" value={query} onChange={event => {setQuery(event.target.value); setVisible(8);}}/></label>
    <label className={styles.basisFilter}>整理依据<select value={priority} onChange={event => {setPriority(event.target.value); setVisible(8);}}><option value="all">全部依据</option>{[...new Set(units.map(unit => unit.priorityBasis))].map(value => <option key={value} value={value}>{basis(value).name}</option>)}</select></label>
    <p className={styles.resultCount} role="status">{matching.length} 条匹配 · 当前显示 {Math.min(visible, matching.length)} 条</p>
    {matching.slice(0, visible).map(unit => <details className={styles.unit} key={`${kind}-${unit.id}`}>
      <summary><span className={styles.unitMeta}><span>PDF 实际第 {unit.sourcePage} 页</span><span className={styles.basis}>{basis(unit.priorityBasis).name}</span></span><span className={styles.unitPreview}>{unit.text}</span><span className={styles.expandLabel}>展开摘录与核对信息</span></summary>
      <div className={styles.unitBody}><p className={styles.sectionName}>章节：{unit.section || '未识别章节标题'}</p><strong>课件文字摘录 · 机器提取</strong><blockquote>{unit.text}</blockquote><p><b>整理依据：</b>{basis(unit.priorityBasis).detail}</p><p className={styles.warning}>{unit.visualVerified ? '原页图像已核对；本片段仍需完成知识点和答案核验。' : unit.qualityFlags?.includes('contains_images') ? '本页包含图片，图表关系尚未视觉核验。文字摘录可能不完整。' : '原页尚未视觉核验；图片清单也可能不完整。'}</p><p className={styles.candidateStatus}>机器候选 · 未确认已学 · 尚不可直接复习</p><p className={styles.sourceFile}>{lecture.sourceFile} · PDF 第 {unit.sourcePage} 页</p></div>
    </details>)}
    {!matching.length && <p className={styles.empty}>这一类没有匹配内容。可更换关键词或整理依据。</p>}
    {matching.length > visible && <button className={styles.more} onClick={() => setVisible(value => value + 8)}>再看 {Math.min(8, matching.length - visible)} 条 <span>还剩 {matching.length - visible} 条</span></button>}
  </>;
}
