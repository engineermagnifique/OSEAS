<p align="center">
  <a href="https://github.com/EnAccess/oseas26-ask-eae">
    <img
      src="https://drive.google.com/uc?id=1gtL_p7l3HbOcCzc09A7KW5d7B5qn-BDs"
      alt="AskEAE"
      width="640"
    >
  </a>
</p>
<p align="center">
    October 26-27 | Open Source in Energy Access Symposium Hackathon | Kigali, Rwanda
</p>

---

# AskEAE

An open-source, NLP-powered chat assistant that guides users through the
[Energy Access Explorer (EAE)](https://www.energyaccessexplorer.org).

## Abstract and goal

Geospatial data plays a crucial role in integrated energy planning. EAE supports
users with no or limited GIS programming or expertise to use EAE for energy
planning by integrating granular data on both energy supply and demand, ensuring
energy solutions are viable for service providers and end-users alike. EAE users
are then able to visualize geospatial data, customize multi-criteria analyses,
and identify and rank priority areas based on their perspective. However, not all
users have a similar understanding of the tools, which often leads to not being
able to utilize the platform effectively.

To bridge this gap, we are looking for a proposal for an open-source large
language model, used through Natural Language Processing (NLP), as an interactive
chat assistant. This system will guide users through complex tasks like creating
detailed priority maps for potential electricity interventions (e.g. stand-alone
PV, minigrid, existing grid) and comprehensive reports by analyzing datasets,
including:

- Demographic information (e.g. population)
- Social and productive energy uses (e.g. nightlights, crops)
- Energy resource availability (e.g. GHI / solar potential)
- Power infrastructure (e.g. existing and planned grids and minigrids)

The NLP-powered chat assistant will provide tailored prompts and real-time
support, ensuring users can optimize their use of EAE's features. By breaking
down barriers of language and technical expertise, this innovation aims to
enhance EAE's accessibility and usability, driving broader adoption and
amplifying its impact in advancing inclusive energy transitions. It should serve
as an always-available assistant that simplifies navigation for new users and
enhances analytical outcomes for returning users.

## Expected outcomes

A new repository being created and populated to:

- Integrate data and train the LLM.
- Annotate data for intents and responses to train the model effectively.
- Fine-tune a pre-trained LLM on a curated dataset (e.g. OpenAI, T5).
- Provide validation and accuracy measurements.
- Design an interactive chatbot and integrate it into EAE.

## Required knowledge

### Stack

- GenAI backend (API key) — please use only open-source LLMs for this exercise.
- An API to connect the GenAI to the database or the frontend (depending on the
  chosen solution).
- The frontend of the chatbot.

EAE is written in plain/modern JavaScript (ECMAScript 2020). There is no
framework; instead a traditional C-style programming pattern is enforced. The
directories contain:

- `src`: JavaScript code
- `stylesheets`: CSS code
- `views`: HTML documents
- `bin`: scripts and executables

### Helpful experiences

- Experience with Generative AI tools (RAG, Open Knowledge Format, prompt
  engineering, or chatbot integration).
- Skills in geospatial data analysis using PostGIS, QGIS, GeoJSON, or spatial
  SQL.
- Proficiency in backend development and API integration.
- Familiarity with web mapping and UI tools.

## Person of contact supporting this challenge

- Santiago Sinclair Lecaros
- Akansha Saklani

## Getting started

- Join the OSEAS Discord server: <https://community.oseas.org/>
- Introduce yourself in the `#introductions` channel and join the relevant
  channels for this challenge.
- Read the documentation:
  - [Energy Access Explorer](https://www.energyaccessexplorer.org)
  - [EAE GitHub](https://github.com/energyaccessexplorer)
  - [EAE Technical Note](https://www.wri.org/research/energy-access-explorer-data-and-methods?ap3c=IGaj6AgspJqgeKwBAGaj6AgmzCZ5Iv70Fr7H6ahniwtFr1FOgg)

