# Contributing

Thanks for helping. Pager is a spare-time project, so small, clear changes are the easiest to review.

- **Everything ships on every platform.** A fix or feature should land in the Android app, the web app (which the desktop app wraps) and,
  where it applies, the server scripts. Say in the pull request what you changed on each.
- **Write the code fresh and keep it readable.** Match the style around it. Explain *why* in comments, not what.
- **Tests:** web `cd app && npx vitest run`; API `cd api && npm test`; GroupMe bridge `cd bridges/groupme && npm test`; desktop
  `cd desktop && npm test`; Android `cd android && ./gradlew :app:testDebugUnitTest`.
- **Try it for real.** `./install.sh --local` on a spare machine or VM gives you a whole server in a few minutes.
- **Licence:** by contributing you agree your work is licensed under AGPL-3.0, like the rest of the project. Do not paste in code you
  do not have the right to share, and do not copy code from other messaging apps or bridges.
- **Security issues:** please do not open a public issue; see SECURITY.md.
