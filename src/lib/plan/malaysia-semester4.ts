import type { BlockKind, PlanTemplate, TimelineDay } from "./types";

type Row = [start: string, end: string, kind: BlockKind, what: string];

/** "@key" links the block to that daily task; anything else is the block's own title. */
function timeline(days: Record<number, Row[]>): TimelineDay[] {
  return Object.entries(days).map(([weekday, rows]) => ({
    weekday: Number(weekday),
    blocks: rows.map(([start, end, kind, what], i) =>
      what.startsWith("@")
        ? { id: `d${weekday}b${i + 1}`, start, end, kind, title: "", taskKey: what.slice(1) }
        : { id: `d${weekday}b${i + 1}`, start, end, kind, title: what },
    ),
  }));
}

/**
 * "Semester 4 Plan: Malaysia (Oct–Feb)" – transcribed from the plan document, with the exercise sessions
 * moved from 06:30 to 19:00, and the weekly schedule enriched with course names/rooms from the UM timetable
 * (Semester 1, 2026/2027; rooms checked against MAYA on 8 Oct 2026).
 */
export const MALAYSIA_SEM4: PlanTemplate = {
  key: "malaysia-sem4",
  title: "Semester 4 · Malaysia",
  subtitle: "19 weeks, Oct 19 – Feb 28. Grades come first. Sunday is rest day.",
  startDate: "2026-10-19",
  endDate: "2027-02-28",
  weightGoalKg: 65,
  intro: "Grades come first. Sunday is rest day.",

  goals: [
    { key: "grades", area: "Grades", target: "A+ in all 6 courses" },
    { key: "applications", area: "Applications", target: "DAAD sent by Oct 30; Japan exchange decided by mid-December" },
    { key: "deeplearning", area: "DeepLearning.AI", target: "Math for ML + ML Specialization certificates; CV updated" },
    { key: "german", area: "German", target: "Goethe B2 certificate" },
    { key: "projects", area: "Projects", target: "ICOM, Talaba, Storytime: 1 release each per month" },
    { key: "fitness", area: "Fitness", target: "Exercise 4x a week; 25 km long run; 65 kg" },
    { key: "travel", area: "Travel", target: "Malaysia, Singapore, Vietnam" },
    { key: "social", area: "Social", target: "1 event a week; 20+ new friends" },
    { key: "ielts", area: "IELTS", target: "Retake in February" },
    { key: "health", area: "Health", target: "No soda; minimal sugar" },
  ],

  dailyTasks: [
    {
      key: "exercise",
      habit: "Exercise sessions",
      title: "Exercise",
      time: "19:00",
      weekdays: [1, 3, 4, 6],
      detailByWeekday: { 1: "Easy run", 3: "Strength", 4: "Long run", 6: "Gym" },
      appendLongRunOn: 4,
    },
    { key: "nutrition", habit: "No-soda days", title: "No soda · protein + creatine + calcium with breakfast", weekdays: [1, 2, 3, 4, 5, 6, 7] },
    { key: "dl", habit: "DeepLearning.AI days", title: "DeepLearning.AI course — 60–90 min", weekdays: [1, 2, 3, 4, 5, 6] },
    { key: "german", habit: "German days", title: "German — 45 min", weekdays: [1, 2, 3, 4, 5, 6, 7] },
    { key: "reading", habit: "Reading days", title: "Read your book — 30 min", weekdays: [1, 2, 3, 4, 5, 6, 7] },
    { key: "review", habit: "Lecture reviews", title: "Review today's lectures — 30 min", weekdays: [1, 2, 3, 4, 5, 6] },
    { key: "projects", habit: "Project days", title: "Projects — 30 min", weekdays: [1, 2, 3, 4, 5, 6] },
    { key: "newperson", habit: "New people met", title: "Talk to 1 new person", weekdays: [1, 2, 3, 4, 5, 6], anytime: true },
    { key: "sleep", habit: "Sleep by 23:30", title: "Sleep by 23:30", time: "23:30", weekdays: [1, 2, 3, 4, 5, 6, 7] },
    { key: "weekly-review", title: "30-min review: log the numbers, plan next week", weekdays: [7] },
  ],

  weeklyGoals: [
    { key: "exercise", area: "Exercise", target: "Mon — easy run · Wed — strength · Thu — long run · Sat — gym" },
    { key: "dl", area: "DeepLearning.AI", target: "1 course week" },
    { key: "german", area: "German", target: "5 hours" },
    { key: "studies", area: "Studies", target: "Assignments done 2 days early" },
    { key: "projects", area: "Projects", target: "1 small result" },
    { key: "social", area: "Social", target: "1 event or club" },
  ],

  books: [
    { id: "b1", title: "Book 1" },
    { id: "b2", title: "Book 2" },
    { id: "b3", title: "Book 3" },
  ],

  schedule: [
    {
      weekday: 1,
      classes: [
        { time: "09:00–10:00", code: "SIT1001", course: "Probability & Statistics I", type: "Tutorial", place: "Room not set in MAYA" },
        { time: "10:00–11:00", code: "WIG3007", course: "Special Topics in Multimedia", type: "Tutorial", place: "Bilik Kuliah 2, FSKTM" },
        { time: "16:00–18:00", code: "TIX1035", course: "Intro to German Level I", type: "Lecture", place: "Bilik Seminar Kiambang, Floor 4, FBL" },
      ],
    },
    {
      weekday: 2,
      classes: [
        { time: "10:00–11:00", code: "WIA2006", course: "Systems Analysis & Design", type: "Tutorial", place: "Online" },
        { time: "14:00–16:00", code: "SIT1001", course: "Probability & Statistics I", type: "Lecture", place: "Dewan Kuliah Teratai, KDK" },
      ],
    },
    {
      weekday: 3,
      classes: [{ time: "14:00–16:00", code: "WIG3007", course: "Special Topics in Multimedia", type: "Lecture", place: "Bilik Kuliah (75), FSKTM" }],
    },
    {
      weekday: 4,
      classes: [
        { time: "14:00–16:00", code: "SIT1001", course: "Probability & Statistics I", type: "Lecture", place: "Dewan Kuliah Teratai, KDK" },
        { time: "16:00–18:00", code: "WIA2006", course: "Systems Analysis & Design", type: "Lecture", place: "Dewan Kuliah 1 (DK1), FSKTM" },
      ],
    },
    {
      weekday: 5,
      classes: [
        { time: "08:00–10:00", code: "GFW0015", course: "Computational Thinking with Robotics", type: "Lecture", place: "Room not set in MAYA" },
        { time: "15:00–17:00", code: "GFW0032", course: "Soft Computing", type: "Lecture", place: "Online" },
      ],
    },
    { weekday: 6, classes: [] },
    { weekday: 7, classes: [] },
  ],

  // The hour-by-hour plan. Written as [start, end, kind, "@task-key" | "title"]; classes are added from `schedule`.
  // Wake-up is 08:00 (07:00 on Fridays, the 08:00 lecture), campus is a 15-minute walk, lights out 23:30.
  timeline: timeline({
    1: [
      ["08:00", "08:45", "meal", "@nutrition"], ["08:45", "09:00", "travel", "Walk to campus"],
      ["11:00", "11:30", "study", "@review"], ["11:30", "13:00", "study", "@dl"], ["13:00", "14:00", "meal", "Lunch"],
      ["14:00", "14:45", "study", "@german"], ["14:45", "15:15", "study", "@projects"], ["15:15", "16:00", "rest", "Free · talk to someone new"],
      ["18:00", "19:00", "travel", "Home and get ready"], ["19:00", "20:00", "exercise", "@exercise"], ["20:00", "21:00", "meal", "Shower and dinner"],
      ["21:00", "21:30", "study", "@reading"], ["21:30", "23:30", "rest", "Free time"], ["23:30", "24:00", "sleep", "@sleep"],
    ],
    2: [
      ["08:00", "08:45", "meal", "@nutrition"], ["08:45", "10:00", "study", "@dl"],
      ["11:00", "11:45", "study", "@german"], ["11:45", "12:15", "study", "@projects"], ["12:15", "13:15", "meal", "Lunch"],
      ["13:15", "13:45", "rest", "Free"], ["13:45", "14:00", "travel", "Walk to campus"],
      ["16:00", "16:30", "study", "@review"], ["16:30", "18:30", "rest", "Free · friends, club, errands"], ["18:30", "19:30", "meal", "Cook and dinner"],
      ["19:30", "20:15", "rest", "Free"], ["20:15", "20:45", "study", "@reading"], ["20:45", "23:30", "rest", "Free time"], ["23:30", "24:00", "sleep", "@sleep"],
    ],
    3: [
      ["08:00", "08:45", "meal", "@nutrition"], ["08:45", "10:15", "study", "@dl"], ["10:15", "11:00", "study", "@german"], ["11:00", "11:30", "study", "@projects"],
      ["11:30", "12:30", "rest", "Free · library, errands"], ["12:30", "13:45", "meal", "Lunch"], ["13:45", "14:00", "travel", "Walk to class"],
      ["16:00", "16:30", "study", "@review"], ["16:30", "18:30", "rest", "Free · talk to someone new"], ["18:30", "19:00", "travel", "Home and get ready"],
      ["19:00", "20:00", "exercise", "@exercise"], ["20:00", "21:00", "meal", "Shower and dinner"],
      ["21:00", "21:30", "study", "@reading"], ["21:30", "23:30", "rest", "Free time"], ["23:30", "24:00", "sleep", "@sleep"],
    ],
    4: [
      ["08:00", "08:45", "meal", "@nutrition"], ["08:45", "10:15", "study", "@dl"], ["10:15", "11:00", "study", "@german"], ["11:00", "11:30", "study", "@projects"],
      ["11:30", "12:30", "rest", "Free · assignments"], ["12:30", "13:45", "meal", "Lunch"], ["13:45", "14:00", "travel", "Walk to class"],
      ["18:00", "18:30", "study", "@review"], ["18:30", "19:00", "travel", "Home and get ready"],
      ["19:00", "21:00", "exercise", "@exercise"], ["21:00", "21:45", "meal", "Shower and dinner"],
      ["21:45", "22:15", "study", "@reading"], ["22:15", "23:30", "rest", "Wind down"], ["23:30", "24:00", "sleep", "@sleep"],
    ],
    5: [
      ["07:00", "07:45", "meal", "@nutrition"], ["07:45", "08:00", "travel", "Walk to campus"],
      ["10:00", "11:30", "study", "@dl"], ["11:30", "12:15", "study", "@german"], ["12:15", "13:15", "meal", "Lunch"], ["13:15", "13:45", "study", "@projects"],
      ["13:45", "15:00", "rest", "Free · assignments"],
      ["17:00", "17:30", "study", "@review"], ["17:30", "18:30", "rest", "Free"], ["18:30", "21:00", "social", "Club or friends · dinner out"],
      ["21:00", "21:30", "study", "@reading"], ["21:30", "23:30", "rest", "Free time"], ["23:30", "24:00", "sleep", "@sleep"],
    ],
    6: [
      ["08:30", "09:15", "meal", "@nutrition"], ["09:15", "10:45", "study", "@dl"], ["10:45", "11:30", "study", "@german"], ["11:30", "12:00", "study", "@projects"],
      ["12:00", "12:30", "study", "@review"], ["12:30", "18:30", "rest", "Free · travel, friends, errands"], ["18:30", "19:00", "travel", "Go to the gym"],
      ["19:00", "20:30", "exercise", "@exercise"], ["20:30", "21:30", "meal", "Shower and dinner"],
      ["21:30", "22:00", "study", "@reading"], ["22:00", "23:30", "rest", "Free time"], ["23:30", "24:00", "sleep", "@sleep"],
    ],
    7: [
      ["09:00", "09:45", "meal", "@nutrition"], ["10:00", "10:45", "study", "@german"], ["10:45", "12:00", "rest", "Rest"], ["12:00", "13:00", "meal", "Lunch"],
      ["13:00", "17:00", "rest", "Free · rest day"], ["17:00", "17:30", "study", "@weekly-review"], ["17:30", "19:00", "rest", "Free"],
      ["19:00", "20:00", "meal", "Dinner"], ["20:00", "20:30", "study", "@reading"], ["20:30", "23:30", "rest", "Free time"], ["23:30", "24:00", "sleep", "@sleep"],
    ],
  }),

  months: [
    {
      key: "oct", name: "October", year: 2026, month: 10, focus: "Applications", longRunKm: 15, weightKg: null, books: 0,
      results: [
        { id: "r1", text: "DAAD sent" },
        { id: "r2", text: "Linear Algebra started" },
        { id: "r3", text: "1 club joined" },
      ],
    },
    {
      key: "nov", name: "November", year: 2026, month: 11, focus: "German + courses", longRunKm: 17, weightKg: null, books: 1,
      results: [
        { id: "r1", text: "Linear Algebra + Calculus done" },
        { id: "r2", text: "Goethe registered" },
        { id: "r3", text: "Trip: Melaka or Penang" },
      ],
    },
    {
      key: "dec", name: "December", year: 2026, month: 12, focus: "Courses + travel", longRunKm: 20, weightKg: null, books: 1,
      results: [
        { id: "r1", text: "Math for ML certificate" },
        { id: "r2", text: "Trip: Singapore" },
      ],
    },
    {
      key: "jan", name: "January", year: 2027, month: 1, focus: "Final exams", longRunKm: 21, weightKg: null, books: 2,
      results: [{ id: "r1", text: "A+ in finals" }],
    },
    {
      key: "feb", name: "February", year: 2027, month: 2, focus: "Exams + wrap-up", longRunKm: 25, weightKg: null, books: 3,
      results: [
        { id: "r1", text: "Goethe B2" },
        { id: "r2", text: "IELTS" },
        { id: "r3", text: "ML Specialization" },
      ],
    },
  ],

  weeks: [
    { n: 1, longRun: "long run 15 km", tasks: ["Add all deadlines and exam dates to the calendar", "DAAD: choose course, write motivation letter, ask for recommendation", "Check Goethe B2 exam dates in KL"] },
    { n: 2, longRun: "long run 15 km", tasks: ["Submit DAAD by Oct 30", "Japan exchange: rules, deadline, documents", "Join 1 UM club"] },
    { n: 3, longRun: "long run 16 km", tasks: ["Finish Linear Algebra", "Register for Goethe B2"] },
    { n: 4, longRun: "long run 17 km", tasks: ["Start Calculus", "Goethe Modelltest #1", "Plan midterm revision"] },
    { n: 5, longRun: "long run 17 km", tasks: ["Collect Japan exchange documents", "Trip: Melaka or Penang"] },
    { n: 6, longRun: "long run 17 km", tasks: ["Finish Calculus", "Goethe Modelltest #2", "ICOM release"] },
    { n: 7, longRun: "long run 18 km", tasks: ["Start Probability (with SIT1001)"] },
    { n: 8, longRun: "long run 19 km", tasks: ["Finish Math for ML → certificate", "Japan exchange: final decision", "Goethe Modelltest #3"] },
    { n: 9, longRun: "long run 20 km", tasks: ["Start ML Specialization", "Finish all course projects", "Trip: Singapore"] },
    { n: 10, longRun: "long run 20 km", tasks: ["Make final exam revision schedule", "Goethe Modelltest #4"] },
    { n: 11, longRun: "long run 20 km", tasks: ["Past exam papers for each course", "Year-end review"] },
    { n: 12, longRun: "long run 20 km", tasks: ["Revise 2 courses a day"] },
    { n: 13, longRun: "long run 20 km", tasks: ["Past papers + formula sheets", "Group study"] },
    { n: 14, longRun: "light runs only", tasks: ["Final exams", "Sleep 7+ hours"] },
    { n: 15, longRun: "long run 21 km", tasks: ["Final exams", "Goethe Modelltest #5", "Book IELTS"] },
    { n: 16, longRun: "long run 22 km", tasks: ["Goethe B2 exam"] },
    { n: 17, longRun: "easy runs", tasks: ["Trip: Vietnam"] },
    { n: 18, longRun: "long run 23–24 km", tasks: ["IELTS exam", "Finish ML Specialization → certificate"] },
    { n: 19, longRun: "long run 25 km", tasks: ["Update CV and LinkedIn", "Semester review + next plan"] },
  ].map((w) => ({ n: w.n, longRun: w.longRun, tasks: w.tasks.map((text, i) => ({ id: `w${w.n}t${i + 1}`, text })) })),

  keyDates: [
    { when: "Oct 30", what: "DAAD deadline" },
    { when: "Early Nov", what: "Register for Goethe B2" },
    { when: "Mid-Dec", what: "Japan exchange decision" },
    { when: "Late Jan", what: "UM final exams (check MAYA)" },
    { when: "Feb", what: "Goethe B2 and IELTS" },
  ],
};
