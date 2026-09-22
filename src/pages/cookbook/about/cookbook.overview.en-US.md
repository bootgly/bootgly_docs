# What is the Cookbook?

The Cookbook teaches Bootgly by **building real, small projects** — one page per project, one platform per section. You do not need to know Bootgly first: every page starts on an empty Linux machine, installs Bootgly with one command and ends with a project you can run, test and keep.

## How a page works

- **Step by step.** Each project is a guided sequence: follow the steps in order, one action per step, with the exact command or the complete file to create.
- **Copy, paste, run.** Every code block is complete — use its copy button. Files carry their path so you always know where they go.
- **Checked along the way.** Steps end with something you can run to confirm you are on track, and every page closes by running the project and its own test.
- **Tested from zero.** Every page was executed, in order, inside a fresh Linux container with nothing of Bootgly installed — the code you see is the code that ran.

## Requirements

Linux (or WSL2) with a terminal. The installer checks for **git** and **PHP 8.4+** and offers to install what is missing through your package manager — nothing else is needed. Shop and Polls additionally need **Docker** to run their database in a container (or an existing MySQL/PostgreSQL server to point them at).

## Projects

<d-block-cards title="Console platform — terminal apps and games">
  <d-block-card
    title="Build a Console App"
    description="Monitor — a live system dashboard: screens, keymaps, status bar and tables over /proc."
    to="/cookbook/console/monitor/overview/"
    icon="monitor_heart"
  />
  <d-block-card
    title="Build a Console Game"
    description="Breakout — a terminal game: fixed-timestep loop, diff-rendered canvas, held keys, scenes and collisions."
    to="/cookbook/console/breakout/overview/"
    icon="sports_esports"
  />
</d-block-cards>

<d-block-cards title="Web platform — sites and APIs">
  <d-block-card
    title="Build a Web App on SQLite"
    description="Guestbook — an MVC web app: a form, a list, SQLite migrations, CSRF, a layout and static assets."
    to="/cookbook/web/guestbook/overview/"
    icon="edit_note"
  />
  <d-block-card
    title="Build a Web REST API"
    description="Contacts — a REST API: JSON CRUD, validation, problem+json errors, pagination and SQLite."
    to="/cookbook/web/contacts/overview/"
    icon="contacts"
  />
  <d-block-card
    title="Build a Web App on MySQL"
    description="Shop — a store on MySQL: catalogue with pagination, a session cart, a checkout in one transaction with row locks, ORM relations."
    to="/cookbook/web/shop/overview/"
    icon="storefront"
  />
  <d-block-card
    title="Build a Web App on PostgreSQL"
    description="Polls — a voting app on PostgreSQL: one vote per visitor by upsert, RETURNING in a transaction, TIMESTAMPTZ, ORM relations."
    to="/cookbook/web/polls/overview/"
    icon="how_to_vote"
  />
</d-block-cards>

Start with the platform you care about — the pages are independent. When you want the concepts behind a step, the [Guide](/guide/getting-started/overview/) explains the topics and the [Manual](/manual/Console/App/overview/) documents each component.
