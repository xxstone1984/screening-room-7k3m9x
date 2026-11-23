export const OFFICIAL_SOURCES = Object.freeze([
  {
    id: "weibo-bailu",
    group: "official",
    platform: "微博",
    label: "白鹿my",
    note: "本人微博 · 最新动态",
    badge: "已认证",
    badgeKind: "verified",
    url: "https://m.weibo.cn/u/2616380702",
    copy: "https://m.weibo.cn/u/2616380702",
    copyKind: "url",
  },
  {
    id: "weibo-studio",
    group: "official",
    platform: "微博",
    label: "白鹿官方工作室",
    note: "工作室物料 · 更新较少",
    badge: "已认证",
    badgeKind: "verified",
    url: "https://m.weibo.cn/u/7555511345",
    copy: "https://m.weibo.cn/u/7555511345",
    copyKind: "url",
  },
  {
    id: "mango-bailu",
    group: "works",
    platform: "芒果TV",
    label: "白鹿明星页",
    note: "简介 · 11 部作品",
    badge: "平台页",
    badgeKind: "platform",
    url: "https://so.mgtv.com/star?id=939165&lastp=so_result",
    copy: "https://so.mgtv.com/star?id=939165&lastp=so_result",
    copyKind: "url"
  },
  {
    id: "tencent-bailu",
    group: "works",
    platform: "腾讯视频",
    label: "白鹿作品页",
    note: "56 部作品 · 剧集与综艺",
    badge: "平台页",
    badgeKind: "platform",
    url: "https://v.qq.com/x/search/?q=%E7%99%BD%E9%B9%BF",
    copy: "https://v.qq.com/x/search/?q=%E7%99%BD%E9%B9%BF",
    copyKind: "url"
  },
  {
    id: "douban-bailu",
    group: "works",
    platform: "豆瓣",
    label: "白鹿人物页",
    note: "57 部影视 · 简介与相册",
    badge: "资料库",
    badgeKind: "platform",
    url: "https://m.douban.com/personage/27579999/",
    copy: "https://m.douban.com/personage/27579999/",
    copyKind: "url"
  },
  {
    id: "weibo-topic",
    group: "community",
    platform: "微博",
    label: "白鹿超话",
    note: "帖子 · 视频 · 签到",
    badge: "粉丝社区",
    badgeKind: "community",
    url: "https://weibo.com/p/10080831263476b143b812a7768373fa708319?k=%E7%99%BD%E9%B9%BF&forward_name=pageinfo",
    copy: "https://weibo.com/p/10080831263476b143b812a7768373fa708319?k=%E7%99%BD%E9%B9%BF&forward_name=pageinfo",
    copyKind: "url",
  }
]);

export const SEED = {
  version: 1,
  unlocked: false,
  introSeen: false,
  ticketCode: "0414",
  daughterName: "亲爱的女儿",
  letterTitle: "写给你的一封信",
  letterBody: "这是只为你一个人开的放映厅。\n\n你喜欢的白鹿，会在每一张片单里出现；你喜欢的角色，会在这里留下自己的座位。\n\n我没有办法让时间停住，但可以把你喜欢的东西，认真地收好。\n\n灯暗下来以后，慢慢看。\n\n——爸爸",
  installedAt: "2026-11-23T20:00:00+08:00",
  news: [
    {
      id: "note-welcome",
      date: "2026-11-23",
      title: "放映厅今天开张",
      summary: "这里不是资讯瀑布，而是一间只为你放映的小厅。每周导入一张片单，留下 3 到 5 条真正值得看的内容。",
      source: "放映厅说明",
      url: "",
      type: "note",
      verified: true,
      featured: true
    },
    {
      id: "note-update",
      date: "2026-11-23",
      title: "本周片单怎么更新",
      summary: "打开“今日放映”，点“导入本周片单”，选择 updates 文件夹里的 JSON 文件即可。没有值得发的资讯时，就让它休映一天。",
      source: "放映厅说明",
      url: "",
      type: "note",
      verified: true,
      featured: false
    },
    {
      id: "source-weibo",
      date: "2026-11-23",
      title: "白鹿本人微博",
      summary: "第一手动态的优先核对入口。只把它当作来源，不把未经证实的营销号内容放进片单。",
      source: "白鹿my",
      url: "https://m.weibo.cn/u/2616380702",
      type: "source",
      verified: true,
      featured: false
    },
    {
      id: "source-studio",
      date: "2026-11-23",
      title: "白鹿官方工作室",
      summary: "工作室发布的图片、视频和行程物料，适合进入“今日放映”和“胶片仓库”。",
      source: "白鹿官方工作室",
      url: "https://m.weibo.cn/u/7555511345",
      type: "source",
      verified: true,
      featured: false
    },
    {
      id: "source-douban",
      date: "2026-11-23",
      title: "豆瓣人物页",
      summary: "作品年表、评分和相册的核对入口；适合查作品，不作为官方消息来源。",
      source: "豆瓣",
      url: "https://m.douban.com/personage/27579999/",
      type: "source",
      verified: false,
      featured: false
    }
  ],
  roles: [
    {
      id: "role-zhaoyao",
      year: 2019,
      title: "招摇",
      role: "路招摇",
      tagline: "招摇过市，也从不低头。",
      description: "从被封禁的门派到重新夺回名字，路招摇的锋利和任性，是白鹿早期很有辨识度的一次亮相。",
      tags: ["古装", "仙侠", "成长"],
      source: "https://m.douban.com/personage/27579999/"
    },
    {
      id: "role-liehuo",
      year: 2019,
      title: "烈火军校",
      role: "谢襄",
      tagline: "替兄从军，把名字藏在军装里。",
      description: "女扮男装进入军校，在训练和任务里一点点证明自己。热血、群像、少年气，是这部戏的关键词。",
      tags: ["年代", "热血", "群像"],
      source: "https://m.douban.com/personage/27579999/"
    },
    {
      id: "role-banshi",
      year: 2020,
      title: "半是蜜糖半是伤",
      role: "江君",
      tagline: "在投行里，温柔也可以是一种锋芒。",
      description: "投行职场与旧日重逢交织，江君的成长线清楚：把委屈咽下去，把专业拿出来。",
      tags: ["都市", "职场", "爱情"],
      source: "https://m.douban.com/personage/27579999/"
    },
    {
      id: "role-zhousheng",
      year: 2021,
      title: "周生如故",
      role: "漼时宜",
      tagline: "一生只等一个人。",
      description: "名门之女与将军的故事，克制、隐忍、后劲很长。漼时宜的安静，不等于没有力量。",
      tags: ["古装", "虐恋", "群像"],
      source: "https://m.douban.com/personage/27579999/"
    },
    {
      id: "role-yisheng",
      year: 2021,
      title: "一生一世",
      role: "时宜",
      tagline: "把前世没说完的话，慢慢说完。",
      description: "现代篇里的时宜是配音演员，温柔、清醒，也更主动。和周生如故连起来看，会有另一种完整感。",
      tags: ["都市", "爱情", "治愈"],
      source: "https://m.douban.com/personage/27579999/"
    },
    {
      id: "role-jingcha",
      year: 2022,
      title: "警察荣誉",
      role: "夏洁",
      tagline: "从见习警员开始，把理想落到地面。",
      description: "没有开挂的主角光环，只有派出所里的琐碎、委屈和成长。夏洁线很适合慢慢看。",
      tags: ["现实", "职场", "群像"],
      source: "https://m.douban.com/personage/27579999/"
    },
    {
      id: "role-changyue",
      year: 2023,
      title: "长月烬明",
      role: "黎苏苏 / 桑酒 / 叶夕雾",
      tagline: "穿过三世，仍要改写宿命。",
      description: "仙侠世界里的三重身份，情感线和命运线都很重。适合按角色分段重看。",
      tags: ["仙侠", "宿命", "三重身份"],
      source: "https://m.douban.com/personage/27579999/"
    },
    {
      id: "role-ningan",
      year: 2023,
      title: "宁安如梦",
      role: "姜雪宁",
      tagline: "重来一次，不做任人摆布的棋子。",
      description: "重生、权谋、选择。姜雪宁的看点不是“赢”，而是知道结局以后，仍然要重新做一次人。",
      tags: ["古装", "权谋", "重生"],
      source: "https://m.douban.com/personage/27579999/"
    }
  ],
  quotes: [
    {
      id: "quote-zhaoyao",
      text: "路招摇：招摇过市，也从不低头。",
      source: "角色关键词",
      kind: "角色关键词",
      createdAt: "2026-11-23T20:00:00+08:00",
      seed: true
    },
    {
      id: "quote-xiexiang",
      text: "谢襄：替兄从军，把名字藏在军装里。",
      source: "角色关键词",
      kind: "角色关键词",
      createdAt: "2026-11-23T20:00:00+08:00",
      seed: true
    },
    {
      id: "quote-jiangjun",
      text: "江君：温柔也可以是一种锋芒。",
      source: "角色关键词",
      kind: "角色关键词",
      createdAt: "2026-11-23T20:00:00+08:00",
      seed: true
    },
    {
      id: "quote-shixia",
      text: "漼时宜：安静，不等于没有力量。",
      source: "角色关键词",
      kind: "角色关键词",
      createdAt: "2026-11-23T20:00:00+08:00",
      seed: true
    },
    {
      id: "quote-xiajie",
      text: "夏洁：把理想落到地面，才算真正开始。",
      source: "角色关键词",
      kind: "角色关键词",
      createdAt: "2026-11-23T20:00:00+08:00",
      seed: true
    },
    {
      id: "quote-susu",
      text: "黎苏苏：穿过三世，仍要改写宿命。",
      source: "角色关键词",
      kind: "角色关键词",
      createdAt: "2026-11-23T20:00:00+08:00",
      seed: true
    },
    {
      id: "quote-jiangxuening",
      text: "姜雪宁：重来一次，不做任人摆布的棋子。",
      source: "角色关键词",
      kind: "角色关键词",
      createdAt: "2026-11-23T20:00:00+08:00",
      seed: true
    }
  ],
  diary: [
    {
      id: "diary-seed",
      date: "2026-11-23",
      mood: "期待",
      title: "首映日",
      text: "今天，放映厅开张了。先看一部最喜欢的，再慢慢把这里填满。",
      photo: "",
      createdAt: "2026-11-23T20:00:00+08:00"
    }
  ],
  watched: [],
  favorites: {
    quotes: [],
    photos: [],
    videos: []
  },
  settings: {
    motion: "full"
  }
};
