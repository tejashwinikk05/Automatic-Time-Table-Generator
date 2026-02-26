
AI-powered Automatic Timetable Generator
---------------------------------------
Files:
- index.html
- style.css
- script.js

Instructions:
- Open index.html in your browser.
- Change week days, periods per day, break and lunch indexes in Step 1.
- Add subjects in Step 2 with hours (number of periods per week) and teacher names.
- Click Generate Timetable. You can export the generated timetable as JSON or CSV.

Notes about algorithm/constraints implemented:
- The generator tries to ensure:
  * No subject appears more than once per day where possible.
  * Subjects are alternated so consecutive periods are not the same subject.
  * Each subject is attempted to be placed once as a first-period in the week (if capacity allows).
  * Break and Lunch are fixed slots across all days.
  * If total required subject-hours exceed available slots, an error will be shown.
- The algorithm is greedy and aims to produce a clash-free timetable but may relax some constraints if impossible.
