# UAT Notes - Test Round 2

This document contains notes and observations from the User Acceptance Testing (UAT) of the application, highlighting general thoughts, specific issues, and feedback for improving the user experience. I included corresponding screenshots in the `tests/uat/screenshots` directory.

For this task, I want you to thoroughly review everything below, including the general thoughts, specific issues, and feedback, and thoroughly review the existing codebase. Then, create a file in the root with a detailed implementation plan for addressing the issues and feedback noted in this document. The plan should have detailed context at the top, and be broken into manageable, yet detailed stages for implementing the code changes. Each stage should include the model and effort level recommended for that stage (Codex-specific model and effort), with the model choices of either Sol 6.1 and Astra 6, and the effort level choices between Medium, High, Extra High, and Ultra. NOTE: Do NOT use the maximum or highest model just because. I have often found that using an unnecessarily overpowered model or effort can often cause Codex to over-engineer the feature or bug fix, which can cause pretty big issues and headaches of their own. So please recommend the model and effort that is appropriate for the complexity of each task. Also, for the item list of specific issues below, you don't need to do 1 stage per item. If an item requires multiple stages, you can set it up as such. But don't do so for the sake of it. I feel like thus far there have been a few times where we took a relatively simple feature or bug fix and ended up generating an 8 stage plan for something that could have been done with a simpler implementation and just 1 or 2 stages. Also, it's possible more than one thing mentioned below can be done in a single stage. The point is, the code changes need to accomplish what is needed. The updates still need to work. But don't go way overboard. Finally, if you have any clarifying questions about what is being asked in the list below, or anything about the expected UX is unclear, please create a section at the top of the file with the clarifying questions. I will then answer them and have you review the answers and revise the plan according to those answers.

## Specific Issues/Feedback/Improvements

- When I start the app:
  - I initially see an alert block saying it's connecting to ChatGPT (#1 in the `tests/uat/screenshots/App_Startup.png` screenshot). That should be removed entirely. It should perform this connection process silently in the background without displaying an alert to the user. It should only notify the user if there is an error connecting, otherwise it should remain completely invisible.
  - The editor part of the app is in "focus", which applies a border and highlights it visually. This should not happen automatically on startup; the editor should only gain focus when the user explicitly clicks into it. If that's tricky for any reason, then please remove the styling that indicates focus (#2 in the `tests/uat/screenshots/App_Startup.png` screenshot).

- In the `tests/uat/screenshots/App_Header.png` screenshot:
  - Please remove the "Return to Work" link from the header when a user is already on the work/editor page.
  - Settings can just be the gear icon.
  - App menu should just be a hamburger icon that opens the menu when clicked.

- In the `tests/uat/screenshots/Editor_Workspace.png` screenshot:
  - The "Outline" panel/menu on the left should be collapsible, allowing users to hide it when not needed to maximize the workspace area (#1 in the screenshot).
  - The editor itself should be wider, taking up more horizontal space within the workspace to improve the writing experience (#2 in the screenshot).

- In the `tests/uat/screenshots/Save_and_Local_Protection.png` screenshot:
  - The entire section of "Save and Local Protection" should be removed. It's just excessive and unnecessary for the user experience.

- In the `tests/uat/screenshots/Project_Title_and_Toolbar.png` screenshot:
  - Remove where it says "Manuscript" above the project title. Users know what they are working on.
  - There's a space above the title, and when inspecting it in my dev tools, it's a div that contains a class with a name containing "projects._session-status*". I believe this is important for cases where there's an issue. But when there is no issue with the session status, this div should be hidden or have a display of `none` or whatever you recommend in order to remove the unnecessary space.
  - On the right, the split button for save should just have the icon and the second part of the split button. It doesn't need the "Save" text. Also, the button is way too wide and should be made more compact.
  - The "Research" button should just be an icon as well, similar to the save button, to save space and maintain a cleaner toolbar appearance. This can be like an open book or anything else you recommend.
  - Remove the "Project" dropdown entirely. We can add revision history a different way later on.
  - The "Save" button, along with other buttons and drop-down button triggers in the app, should have a transparent background. When a drop-down is opened/expanded, the options list should NOT have a transparent background, as it likely will be in front of other UI elements.

- In the `tests/uat/screenshots/Outline_Nav.png` screenshot:
  - The button row for adding a new section/chapter and changing the view should be updated so the add button takes up the majority of the row space, and the view button is smaller and positioned to the right, and has an icon instead of a label.
  - When a list item is active, the `<span>` should have a little padding on the left so it's not so close to the dark line on the left.
  - The list items should not have the ` - draft` suffix. That makes it seem like there are unsaved changes to a section or chapter. It's confusing. Let's get rid of that suffix entirely.

- When going between pages/views, the UI auto-jumps/scrolls to that section of the page. For instance, if I click Settings at the top, it takes me to settings scrolled to the "Appearance and accessibility" section. It shouldn't do this. No matter where a user navigates to, if it is taking them from a different page or view, the scroll position should reset to the top of the new page/view.
