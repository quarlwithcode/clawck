# ATP Industry Benchmark Sources

This document defines the default industry benchmark values used by Clawck for human-equivalent time comparisons in ATP v0.2 `EntryComparison` objects. Each category includes representative task types, estimated human completion times, and supporting citations.

---

## Methodology

Benchmark values represent the **median time a competent professional** would spend on the task without AI assistance. Values are derived from industry surveys, time-tracking aggregates, and professional practice literature. Where exact studies are unavailable, estimates are triangulated from multiple practitioner sources and calibrated against large-scale time-tracking datasets.

All times assume a single practitioner working on a task of typical complexity. Highly specialized or unusually complex tasks may exceed these estimates significantly.

---

## Benchmark Values by Category

### code

| Task Type | Benchmark | Minutes |
|-----------|-----------|---------|
| PR review | Review a standard pull request (< 400 lines) | 30 min |
| Bug fix | Diagnose and fix a moderate bug | 45 min |
| Feature | Implement a small-to-medium feature | 240 min (4 hrs) |
| Unit tests | Write unit tests for an existing module | 120 min (2 hrs) |

**Default category benchmark:** 240 min (feature-level task)

**Sources:**
- SmartBear / Cisco study on code review practices: optimal review sessions are 60-90 minutes, with single PR reviews averaging 30-60 minutes for reviewable changesets. [SmartBear, "Best Practices for Code Review," 2023]
- Stack Overflow Developer Survey (2023, 2024): median developer reports spending 30-60 minutes per code review and 4-8 hours on new feature implementation.
- Stripe Developer Coefficient Report (2018): developers spend ~17.3 hours/week on maintenance tasks including debugging; individual bug fixes average 30-90 minutes.
- GitClear "Software Development in 2024" report: average time-to-merge for PRs is increasing, with median feature branches taking 4-6 hours of active development.

---

### content

| Task Type | Benchmark | Minutes |
|-----------|-----------|---------|
| Blog post | Draft a 1,000-1,500 word blog post | 180 min (3 hrs) |
| Social post | Write and schedule a social media post | 30 min |
| Email | Compose a professional email or newsletter | 15 min |
| Technical documentation | Write a technical document or guide | 240 min (4 hrs) |

**Default category benchmark:** 180 min (blog post)

**Sources:**
- Orbit Media Studios Annual Blogging Survey (2023): average blog post takes 4 hours 10 minutes; median closer to 3 hours for posts under 1,500 words.
- Content Marketing Institute "B2B Content Marketing" report (2024): technical content creation averages 3-6 hours per piece.
- Sprout Social Index (2023): social media managers spend 15-45 minutes per post including copy, imagery selection, and scheduling.
- Boomerang email productivity research: the average professional email takes 5-15 minutes to compose; complex business emails up to 30 minutes.

---

### research

| Task Type | Benchmark | Minutes |
|-----------|-----------|---------|
| Competitive analysis | Analyze 3-5 competitors across defined dimensions | 360 min (6 hrs) |
| Literature review | Survey and synthesize 10-20 sources on a topic | 480 min (8 hrs) |

**Default category benchmark:** 360 min (competitive analysis)

**Sources:**
- Crayon "State of Competitive Intelligence" report (2023): CI professionals spend 6-10 hours on a standard competitive analysis deliverable.
- Academic research methodology literature: systematic literature reviews take 20-80+ hours; a focused topical review of 10-20 sources typically requires 6-12 hours. [Fink, A. "Conducting Research Literature Reviews," Sage, 2019]
- McKinsey Global Institute productivity reports: knowledge workers spend approximately 19% of their time searching for and gathering information.

---

### data_entry

| Task Type | Benchmark | Minutes |
|-----------|-----------|---------|
| Spreadsheet (100 rows) | Manual data entry of ~100 structured rows | 120 min (2 hrs) |
| Migration script | Write and validate a data migration script | 180 min (3 hrs) |

**Default category benchmark:** 120 min (spreadsheet entry)

**Sources:**
- Bureau of Labor Statistics Occupational Outlook: data entry keyers process 10,000-15,000 keystrokes per hour; 100 rows of moderate-complexity data takes 1-3 hours depending on field count.
- Zapier "State of Business Automation" report (2023): manual data tasks average 2-4 hours per batch for small-to-medium datasets.
- Stack Overflow and DBA community estimates: data migration scripts for moderate schemas take 2-6 hours including testing and validation.

---

### analysis

| Task Type | Benchmark | Minutes |
|-----------|-----------|---------|
| Quarterly report | Compile and analyze a quarterly business report | 480 min (8 hrs) |
| Data visualization | Create a polished data visualization or dashboard | 120 min (2 hrs) |

**Default category benchmark:** 480 min (quarterly report)

**Sources:**
- FP&A Trends Survey (2023): finance professionals spend 1-2 full days on quarterly reporting, with 6-10 hours of active analysis work.
- Databox "State of Business Reporting" (2023): creating a standard business report takes 5-10 hours on average.
- Storytelling with Data community surveys: a single polished data visualization takes 1-4 hours depending on complexity; dashboard pages take 2-6 hours.

---

### testing

| Task Type | Benchmark | Minutes |
|-----------|-----------|---------|
| Test plan | Write a test plan for a feature or release | 120 min (2 hrs) |
| Regression suite | Design and document a regression test suite | 240 min (4 hrs) |

**Default category benchmark:** 120 min (test plan)

**Sources:**
- ISTQB Foundation Level Syllabus: test planning and design activities account for 10-30% of total project effort; a feature-level test plan typically takes 2-4 hours.
- Ministry of Testing community surveys: QA professionals report spending 2-3 hours on test plans for medium-complexity features and 4-8 hours on comprehensive regression suites.
- SmartBear "State of Software Quality" report (2023): test creation and maintenance consume an average of 25% of QA time, with individual test suite creation taking 3-6 hours.

---

### design

| Task Type | Benchmark | Minutes |
|-----------|-----------|---------|
| Wireframe | Create wireframes for a feature or page | 180 min (3 hrs) |
| Email template | Design an email template | 120 min (2 hrs) |

**Default category benchmark:** 180 min (wireframe)

**Sources:**
- Nielsen Norman Group UX research: wireframing a single page or feature flow takes 2-4 hours for an experienced designer; higher-fidelity wireframes take longer.
- Litmus "State of Email" report (2023): email template design and development averages 2-4 hours per template.
- UX Design Institute industry benchmarks: low-fidelity wireframes average 1-3 hours; medium-fidelity with annotations average 3-6 hours.

---

### communication

| Task Type | Benchmark | Minutes |
|-----------|-----------|---------|
| Meeting summary | Summarize a 30-60 minute meeting with action items | 30 min |
| Status report | Write a project status update | 45 min |

**Default category benchmark:** 30 min (meeting summary)

**Sources:**
- Harvard Business Review research on meeting productivity (2022): professionals spend 15-30 minutes summarizing a one-hour meeting; detailed minutes with action items take 30-45 minutes.
- Asana "Anatomy of Work" Index (2023): workers spend 58% of their time on "work about work" including status updates; individual status reports take 30-60 minutes.
- Otter.ai productivity research: manual meeting summarization takes 2-3x the length of the meeting for comprehensive notes; 0.5x for a focused summary.

---

### planning

| Task Type | Benchmark | Minutes |
|-----------|-----------|---------|
| Sprint planning | Prepare and run sprint planning for a small team | 120 min (2 hrs) |
| Roadmap | Draft a product or project roadmap | 240 min (4 hrs) |

**Default category benchmark:** 120 min (sprint planning)

**Sources:**
- Scrum Guide (2020): sprint planning is timeboxed to 8 hours for a one-month sprint; for two-week sprints, 2-4 hours is typical including preparation.
- Atlassian Agile Coach resources: sprint planning preparation takes 1-2 hours; the ceremony itself takes 1-2 hours for teams of 5-9.
- ProductPlan "State of Product Management" report (2023): roadmap creation and maintenance takes 3-8 hours per quarter; initial roadmap drafts take 4-6 hours.

---

### other

| Task Type | Benchmark | Minutes |
|-----------|-----------|---------|
| Miscellaneous admin | General administrative or uncategorized tasks | 60 min (1 hr) |

**Default category benchmark:** 60 min

**Sources:**
- McKinsey Global Institute "The Social Economy" (2012, updated 2023): knowledge workers spend 28% of their workweek on email and administrative tasks; individual admin items average 15-60 minutes.
- RescueTime productivity data (2023): the median "productive" task session lasts 45-75 minutes.

---

## Summary Table

| Category | Default Benchmark | Representative Task |
|----------|------------------:|---------------------|
| code | 240 min | Feature implementation |
| content | 180 min | Blog post |
| research | 360 min | Competitive analysis |
| data_entry | 120 min | Spreadsheet (100 rows) |
| analysis | 480 min | Quarterly report |
| testing | 120 min | Test plan |
| design | 180 min | Wireframe |
| communication | 30 min | Meeting summary |
| planning | 120 min | Sprint planning |
| other | 60 min | Misc admin |

---

## Updating Benchmarks

Benchmark values should be reviewed annually against new survey data. To override defaults, configure `benchmarks` in the ATP export envelope or adjust `human_equivalents` in `clawck.config.json`.

Community contributions of benchmark data with citations are welcome via pull request.
