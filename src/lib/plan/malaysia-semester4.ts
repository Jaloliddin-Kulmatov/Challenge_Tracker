import type { PlanTemplate } from "./types";

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
  intro: "Grades come first. Sunday is rest day.",

  goals: [
    { key: "grades", area: "Grades", target: "A+ in all 6 courses" },
    { key: "applications", area: "Applications", target: "DAAD sent by Oct 30; Japan exchange decided by mid-December" },
    { key: "deeplearning", area: "DeepLearning.AI", target: "Math for ML + ML Specialization certificates; CV updated" },
    { key: "german", area: "German", target: "Goethe B2 certificate" },
    { key: "projects", area: "Projects", target: "ICOM, Talaba, Storytime: 1 release each per month" },
    { key: "fitness", area: "Fitness", target: "Exercise 4x a week; 25 km long run; 65 kg" },
    { key: "social-media", area: "YouTube + Instagram", target: "1,000 subscribers on each" },
    { key: "travel", area: "Travel", target: "Malaysia, Singapore, Vietnam" },
    { key: "social", area: "Social", target: "1 event a week; 20+ new friends" },
    { key: "ielts", area: "IELTS", target: "Retake in February" },
    { key: "health", area: "Health", target: "No soda; minimal sugar" },
  ],

  dailyTasks: [
    {
      key: "exercise",
      title: "Exercise",
      time: "19:00",
      weekdays: [1, 3, 4, 6],
      detailByWeekday: { 1: "Easy run", 3: "Strength", 4: "Long run", 6: "Gym" },
      appendLongRunOn: 4,
    },
    { key: "nutrition", title: "No soda · protein + creatine + calcium with breakfast", weekdays: [1, 2, 3, 4, 5, 6, 7] },
    { key: "dl", title: "DeepLearning.AI course — 60–90 min", weekdays: [1, 2, 3, 4, 5, 6] },
    { key: "german", title: "German — 45 min", weekdays: [1, 2, 3, 4, 5, 6] },
    { key: "review", title: "Review today's lectures — 30 min", weekdays: [1, 2, 3, 4, 5, 6] },
    { key: "projects", title: "Projects — 30 min", weekdays: [1, 2, 3, 4, 5, 6] },
    { key: "newperson", title: "Talk to 1 new person", weekdays: [1, 2, 3, 4, 5, 6] },
    { key: "post", title: "Daily post on LinkedIn or Instagram", weekdays: [1, 2, 3, 4, 5, 6] },
    { key: "sleep", title: "Sleep by 23:30", time: "23:30", weekdays: [1, 2, 3, 4, 5, 6, 7] },
    { key: "weekly-review", title: "30-min review: log the numbers, plan next week", weekdays: [7] },
  ],

  weeklyGoals: [
    { key: "exercise", area: "Exercise", target: "Mon — easy run · Wed — strength · Thu — long run · Sat — gym" },
    { key: "youtube", area: "YouTube", target: "1 video" },
    { key: "instagram", area: "Instagram", target: "2 reels" },
    { key: "dl", area: "DeepLearning.AI", target: "1 course week" },
    { key: "german", area: "German", target: "5 hours" },
    { key: "studies", area: "Studies", target: "Assignments done 2 days early" },
    { key: "projects", area: "Projects", target: "1 small result" },
    { key: "social", area: "Social", target: "1 event or club" },
  ],

  schedule: [
    {
      weekday: 1,
      classes: [
        { time: "10:00–11:00", code: "WIG3007", course: "Special Topics in Multimedia", type: "Tutorial", place: "Bilik Kuliah 2, FSKTM" },
        { time: "16:00–18:00", code: "TIX1035", course: "Intro to German Level I", type: "Lecture", place: "Bilik Seminar Kiambang, Floor 4, FBL" },
      ],
      free: ["DeepLearning.AI course", "WIG3007 work"],
      exercise: { time: "19:00", what: "Easy run" },
    },
    {
      weekday: 2,
      classes: [
        { time: "10:00–11:00", code: "WIA2006", course: "Systems Analysis & Design", type: "Tutorial", place: "Online" },
        { time: "14:00–16:00", code: "SIT1001", course: "Probability & Statistics I", type: "Lecture", place: "Dewan Kuliah Teratai, KDK" },
      ],
      free: ["SIT1001 practice", "ICOM"],
    },
    {
      weekday: 3,
      classes: [{ time: "14:00–16:00", code: "WIG3007", course: "Special Topics in Multimedia", type: "Lecture", place: "Bilik Kuliah (75), FSKTM" }],
      free: ["Projects (morning)"],
      exercise: { time: "19:00", what: "Strength" },
    },
    {
      weekday: 4,
      classes: [
        { time: "14:00–16:00", code: "SIT1001", course: "Probability & Statistics I", type: "Lecture", place: "Dewan Kuliah Teratai, KDK" },
        { time: "16:00–18:00", code: "WIA2006", course: "Systems Analysis & Design", type: "Lecture", place: "Dewan Kuliah 1 (DK1), FSKTM" },
      ],
      free: ["DeepLearning.AI course"],
      exercise: { time: "19:00", what: "Long run" },
    },
    {
      weekday: 5,
      classes: [
        { time: "08:00–10:00", code: "GFW0015", course: "Computational Thinking with Robotics", type: "Lecture", place: "Room not set in MAYA" },
        { time: "15:00–17:00", code: "GFW0032", course: "Soft Computing", type: "Lecture", place: "Room not set in MAYA" },
      ],
      free: ["Assignments", "German", "Club / event"],
    },
    {
      weekday: 6,
      classes: [],
      free: ["Film, edit and post video", "Travel"],
      exercise: { time: "19:00", what: "Gym" },
    },
    {
      weekday: 7,
      classes: [],
      free: ["Rest", "30-min review: log the numbers, plan next week"],
      note: "Rest day.",
    },
  ],

  months: [
    {
      key: "oct", name: "October", year: 2026, month: 10, focus: "Applications", youtube: 100, instagram: 100, longRunKm: 15,
      results: [
        { id: "r1", text: "DAAD sent" },
        { id: "r2", text: "Linear Algebra started" },
        { id: "r3", text: "1 club joined" },
      ],
    },
    {
      key: "nov", name: "November", year: 2026, month: 11, focus: "German + courses", youtube: 300, instagram: 300, longRunKm: 17,
      results: [
        { id: "r1", text: "Linear Algebra + Calculus done" },
        { id: "r2", text: "Goethe registered" },
        { id: "r3", text: "Trip: Melaka or Penang" },
      ],
    },
    {
      key: "dec", name: "December", year: 2026, month: 12, focus: "Courses + travel", youtube: 550, instagram: 550, longRunKm: 20,
      results: [
        { id: "r1", text: "Math for ML certificate" },
        { id: "r2", text: "Trip: Singapore" },
      ],
    },
    {
      key: "jan", name: "January", year: 2027, month: 1, focus: "Final exams", youtube: 750, instagram: 750, longRunKm: 21,
      results: [{ id: "r1", text: "A+ in finals" }],
    },
    {
      key: "feb", name: "February", year: 2027, month: 2, focus: "Exams + wrap-up", youtube: 1000, instagram: 1000, longRunKm: 25,
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
