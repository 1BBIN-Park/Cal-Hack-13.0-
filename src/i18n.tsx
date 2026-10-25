import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

// One language at a time, chosen per device (grandma's phone in 中文, the
// family's in English). Claude still writes both explanations; this only picks
// which one to show.
export type Lang = 'zh' | 'en';

const STRINGS = {
  appName: { zh: '多看一眼', en: 'SecondLook' },
  tagline: {
    zh: '收到陌生的投资应用或链接？先检查一下，家人也能看到结果。',
    en: 'Got an unfamiliar investment app or link? Check it first, and your family sees the result too.',
  },
  invalidLink: {
    zh: '这个链接里的配对码无效，请重新配对。',
    en: 'The pairing code in this link isn’t valid. Please pair again.',
  },
  iCheckApp: { zh: '我要检查应用', en: 'I want to check an app' },
  iAmFamily: { zh: '我是家人', en: 'I’m a family member' },
  yourCode: { zh: '您的配对码', en: 'Your pairing code' },
  pairingCodeIs: { zh: '配对码', en: 'Pairing code' },
  giveCode: { zh: '请把这个码告诉您的家人。', en: 'Give this code to a family member.' },
  continue: { zh: '继续', en: 'Continue' },
  back: { zh: '返回', en: 'Back' },
  enterCode: { zh: '输入配对码', en: 'Enter pairing code' },
  pair: { zh: '配对', en: 'Pair' },
  unpair: { zh: '取消配对', en: 'Unpair' },
  connecting: { zh: '正在连接…', en: 'Connecting to server…' },
  cantConnect: {
    zh: '无法连接服务器，请检查网络。',
    en: 'Can’t reach the server. Check your internet connection.',
  },
  codeForFamily: { zh: '配对码（给家人看）', en: 'Pairing code (show your family)' },
  checkAnApp: { zh: '检查应用或链接', en: 'Check an app or link' },
  chooseApk: { zh: '选择安装包 (APK)', en: 'Choose an APK file' },
  orPasteLink: { zh: '或粘贴链接', en: 'Or paste a link' },
  wholeMessageOk: { zh: '可以粘贴整条短信', en: 'Pasting the whole message is OK' },
  willCheck: { zh: '将检查：', en: 'Will check:' },
  writtenAs: { zh: '原文写作：', en: 'Written in the message as:' },
  checkLink: { zh: '检查链接', en: 'Check link' },
  checking: { zh: '正在检查，请稍候…', en: 'Checking, please wait…' },
  result: { zh: '检查结果', en: 'Result' },
  lastCheck: { zh: '上次检查', en: 'Last check' },
  noChecks: { zh: '还没有检查记录', en: 'No checks yet' },
  noResult: { zh: '还没有结果，请再试一次。', en: 'No result yet, please try again.' },
  notConnected: { zh: '暂时无法检查，请先问问家人。', en: 'Checking isn’t available right now. Ask your family first.' },
  sendFailed: {
    zh: '暂时无法检查，请稍后再试，或先问问家人。',
    en: 'Couldn’t check right now. Try again in a minute, or ask your family first.',
  },
  pairedWith: { zh: '已配对，配对码', en: 'Paired with code' },
  familyAlerts: { zh: '家人提醒', en: 'Family alerts' },
  loading: { zh: '加载中…', en: 'Loading…' },
  noAlerts: { zh: '暂无警报', en: 'No alerts yet' },
  noAlertsHint: {
    zh: '家人检查应用或链接后，结果会立刻显示在这里。',
    en: 'When your family member checks an app or link, the result shows up here instantly.',
  },
  newBadge: { zh: '新', en: 'NEW' },
  highRisk: { zh: '高风险', en: 'High risk' },
  mediumRisk: { zh: '中等风险', en: 'Medium risk' },
  // Links get a domain-only check, so "low" must not read as "safe".
  lowRisk: { zh: '未发现明显风险', en: 'No warning signs found' },
  aiExplanation: { zh: 'AI 解释（Claude）', en: 'AI explanation (Claude)' },
  foundByRules: { zh: '规则检测（英文）', en: 'Found by rules' },
  // "What to do" is fixed text picked by risk level (never Claude's), one set
  // for the elder's own card and one for the family's.
  nextStep: { zh: '下一步', en: 'What to do' },
  nextHighElder: {
    zh: '不要点击链接，也不要安装。先给家人打个电话。',
    en: 'Don’t tap the link or install anything. Call your family first.',
  },
  nextHighFamily: {
    zh: '请马上给家人打电话，提醒他们不要点击或安装。',
    en: 'Call them now, before they tap or install anything.',
  },
  nextMediumElder: {
    zh: '先别点击或安装，问问家人。',
    en: 'Don’t tap or install anything yet. Ask your family first.',
  },
  nextMediumFamily: {
    zh: '在他们点击或安装之前，和他们聊一聊。',
    en: 'Check in with them before they tap or install anything.',
  },
  nextLowElder: {
    zh: '这不代表一定安全。如果有人催您付款或安装，先问问家人。',
    en: 'This doesn’t guarantee it’s safe. If anyone rushes you to pay or install, ask your family first.',
  },
  nextLowFamily: {
    zh: '这不代表一定安全。如果他们被催着付款或安装，问一问他们。',
    en: 'This doesn’t guarantee it’s safe. If they were rushed to pay or install, check in with them.',
  },
  switchTo: { zh: 'English', en: '中文' },
} satisfies Record<string, Record<Lang, string>>;

export type StringKey = keyof typeof STRINGS;

const STORAGE_KEY = 'lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch {
    // storage blocked: fall back to the device language
  }
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

type LangState = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: StringKey) => string;
};

const LangContext = createContext<LangState | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  }, [lang]);
  const setLang = (next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // not fatal: the choice just won't survive a reload
    }
  };
  const t = (key: StringKey) => STRINGS[key][lang];
  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export function useLang(): LangState {
  const state = useContext(LangContext);
  if (!state) throw new Error('useLang must be used inside <LangProvider>');
  return state;
}

export function LangToggle() {
  const { lang, setLang, t } = useLang();
  const next: Lang = lang === 'zh' ? 'en' : 'zh';
  return (
    <button
      className="lang-toggle"
      lang={next === 'zh' ? 'zh-CN' : 'en'}
      onClick={() => setLang(next)}
      aria-label={next === 'zh' ? '切换到中文' : 'Switch to English'}
    >
      {t('switchTo')}
    </button>
  );
}
