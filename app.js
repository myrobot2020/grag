// --- Global State & Database Mock Datasets ---
let activeTab = 'dashboard';
let currentDb = 'sqlite:///rag_database.db';
let dbDriver = 'sqlite';
let isReadOnly = true;
let totalMutations = 0;

// Current stage, passing threshold, last scores
let activeStage = 1;
let passingThresholds = { 0: 1.00, 1: 0.70, 2: 0.70, 3: 0.70, 4: 0.80 };
let currentScores = { 0: null, 1: null, 2: null, 3: null, 4: null };
let lastReportIndex = 0;

// Loop simulation status: 'IDLE', 'CONNECTING', 'QA_GEN', 'EVAL_RUNNING', 'REPORT_COMPILING', 'JUDGE_FEEDBACK', 'MUTATING'
let loopState = 'IDLE';
let simInterval = null;
let currentQuestionIndex = 0;
let evalAttempts = 0;

// Active Database Schema Definition (dynamic Iris dataset)
let activeSchema = {
    domain: 'Iris Flower Biology Dataset',
    tables: [
        {
            name: 'iris',
            columns: [
                { name: 'id', type: 'INTEGER', key: 'PK' },
                { name: 'sepal_length', type: 'REAL' },
                { name: 'sepal_width', type: 'REAL' },
                { name: 'petal_length', type: 'REAL' },
                { name: 'petal_width', type: 'REAL' },
                { name: 'species', type: 'TEXT' }
            ]
        }
    ]
};

// Default Iris Question Bank
let questions = [
    // Stage 1
    { id: 101, stage: 1, text: "How many flowers are in the database?", answerable: "yes", mode: "SELECT COUNT(*) FROM iris" },
    { id: 102, stage: 1, text: "What is the species of the flower with id 5?", answerable: "yes", mode: "SELECT species FROM iris WHERE id=5" },
    { id: 103, stage: 1, text: "What is the leaf type of flower id 12?", answerable: "no", mode: "UNANSWERABLE (Missing column 'leaf_type')" },
    { id: 104, stage: 1, text: "Show the average petal density of all rows.", answerable: "no", mode: "UNANSWERABLE (Missing column 'petal_density')" },
    // Stage 2
    { id: 201, stage: 2, text: "What is the species of flower id 15, and what is its sepal length?", answerable: "yes", mode: "SELECT species, sepal_length FROM iris WHERE id=15" },
    { id: 202, stage: 2, text: "Find the flower with id 22, and what is the difference between its sepal length and sepal width?", answerable: "yes", mode: "SELECT sepal_length - sepal_width FROM iris WHERE id=22" },
    { id: 203, stage: 2, text: "What is the growth rate of flower id 25 and its color?", answerable: "no", mode: "UNANSWERABLE (Missing columns 'growth_rate', 'color')" },
    { id: 204, stage: 2, text: "For the flower with id 30, retrieve its smell intensity and matching species.", answerable: "no", mode: "UNANSWERABLE (Missing column 'smell_intensity')" },
    // Stage 3
    { id: 301, stage: 3, text: "What is the average sepal width of the species setosa?", answerable: "yes", mode: "SELECT AVG(sepal_width) FROM iris WHERE species='setosa'" },
    { id: 302, stage: 3, text: "What is the maximum petal length for the species virginica?", answerable: "yes", mode: "SELECT MAX(petal_length) FROM iris WHERE species='virginica'" },
    { id: 303, stage: 3, text: "Show the average height of iris-setosa grouped by geographic location.", answerable: "no", mode: "UNANSWERABLE (Missing columns 'height', 'geographic_location')" },
    { id: 304, stage: 3, text: "What is the maximum flower price grouped by country of origin?", answerable: "no", mode: "UNANSWERABLE (Missing columns 'price', 'country_of_origin')" },
    // Stage 4
    { id: 401, stage: 4, text: "What is the average petal length of flowers where petal width is greater than 1.5?", answerable: "yes", mode: "SELECT AVG(petal_length) FROM iris WHERE petal_width > 1.5" },
    { id: 402, stage: 4, text: "How many flowers have a sepal length greater than 7.0 and a petal length less than 6.0?", answerable: "yes", mode: "SELECT COUNT(*) FROM iris WHERE sepal_length > 7.0 AND petal_length < 6.0" },
    { id: 403, stage: 4, text: "Find the classification model accuracy metrics for this dataset.", answerable: "no", mode: "UNANSWERABLE (Non-existent metrics)" },
    { id: 404, stage: 4, text: "What is the soil nitrogen level of virginica species where petal width is 0.2?", answerable: "no", mode: "UNANSWERABLE (Missing column 'soil_nitrogen')" }
];

// Historical Reports Mock data
let reports = [
    {
        id: "R-092",
        timestamp: "2026-08-03 14:12:05",
        mutationSeed: "32801",
        agentVersion: "1.0.0 (Baseline)",
        status: "Failed",
        failedStage: "Stage 4",
        score: "40%",
        feedback: "Agent failed in Stage 4 by hallucinating schema. It attempted to answer 'credit score' by writing a query targeting a non-existent column 'credit_score' on the customers table. It should have returned 'UNANSWERABLE'.",
        patchApplied: "None"
    },
    {
        id: "R-093",
        timestamp: "2026-08-03 18:40:12",
        mutationSeed: "49281",
        agentVersion: "1.0.1 (Strict Safeguard)",
        status: "Passed",
        failedStage: "None",
        score: "92%",
        feedback: "Agent successfully identified all unanswerable queries in Stage 4 by printing 'UNANSWERABLE'. No modifications needed.",
        patchApplied: "Suffix update to prompts.json"
    }
];

// Code Files mock contents
let filesContent = {
    agent: `# agent.py - Dynamic LangChain RAG SQL Bot
import os
import sqlite3
from langchain_community.utilities import SQLDatabase
from langchain_community.agent_toolkits import create_sql_agent
from langchain_openai import ChatOpenAI

def get_agent(db_uri):
    # Initialize SQL Database dynamically
    db = SQLDatabase.from_uri(db_uri, sample_rows_in_table_info=2)
    
    # Setup model using DeepSeek from Desktop keys
    llm = ChatOpenAI(
        model="deepseek-ai/deepseek-v4-flash",
        api_key=os.environ.get("DEEPSEEK_API_KEY", "nvapi-..."),
        base_url="https://integrate.api.nvidia.com/v1",
        temperature=0.0
    )
    
    # Define agent prompt rules
    prompt_suffix = """
    You must always query the schema first before generating questions.
    If you are asked a question about table names or columns that do not exist,
    or if you cannot answer the query with facts, you must answer exactly "UNANSWERABLE".
    Never make up rows or columns.
    """
    
    agent_executor = create_sql_agent(
        llm=llm,
        db=db,
        verbose=True,
        handle_parsing_errors=True,
        prompt_suffix=prompt_suffix
    )
    
    return agent_executor`,
    prompts: `{
  "system_instruction": "You are a database SQL reasoning assistant. Use the available database connections to fetch data, never make up answers.",
  "prompt_suffix": "If you are asked a question about table names or columns that do not exist, or if you cannot answer the query with facts, you must answer exactly 'UNANSWERABLE'. Never make up rows or columns."
}`
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initSchemaVisualizer();
    initQuestionsTable();
    initReportsList();
    initCodeTabs();
    updateUIOverview();
    
    // Wire simulation controls
    document.getElementById('btn-play-sim').addEventListener('click', toggleLoopSimulation);
    document.getElementById('btn-step').addEventListener('click', stepSimulation);
    document.getElementById('btn-reset').addEventListener('click', resetAgentState);
    document.getElementById('btn-mutate-db').addEventListener('click', triggerMutationSimulation);
});

// --- Tab Switching Logic ---
function initTabs() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const panes = document.querySelectorAll('.tab-pane');
    const tabTitle = document.getElementById('tab-title');
    const tabSubtitle = document.getElementById('tab-subtitle');

    const subtitles = {
        'dashboard': 'Real-time status of the general RAG bot evaluation loop',
        'database': 'Manage active database credentials, drivers, and schema structures',
        'eval-questions': 'Manage the evaluation database of answerable and trick questions',
        'judge': 'Configure LLM judges, temperature settings, and feedback prompts',
        'code': 'View and edit agent.py prompt definitions and model bindings',
        'reports': 'Examine past optimization logs and LLM feedback logs',
        'visualizer': 'Trace the state graph of the self-updating RAG pipeline'
    };

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            activeTab = targetTab;
            
            navButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            panes.forEach(pane => {
                pane.classList.remove('active');
                if (pane.id === `pane-${targetTab}`) {
                    pane.classList.add('active');
                }
            });

            tabTitle.textContent = btn.textContent.trim() + " Panel";
            tabSubtitle.textContent = subtitles[targetTab] || '';
            
            // Sync with SVGs or dynamic renderers
            if (targetTab === 'visualizer') {
                updateVisualizerDiagram();
            }
        });
    });
}

// --- Schema Map Visualizer ---
function initSchemaVisualizer() {
    const container = document.getElementById('schema-visualizer');
    container.innerHTML = '';
    
    activeSchema.tables.forEach(table => {
        const tableCard = document.createElement('div');
        tableCard.className = 'schema-table-card';
        
        let colsHtml = '';
        table.columns.forEach(col => {
            let keyHtml = '';
            if (col.key) {
                keyHtml = `<span class="col-key">${col.key}</span>`;
            }
            colsHtml += `
                <div class="schema-col-item">
                    <span class="col-name">${col.name}</span>
                    <span class="col-type">${col.type} ${keyHtml}</span>
                </div>
            `;
        });
        
        tableCard.innerHTML = `
            <div class="schema-table-header">
                <span class="schema-table-name">${table.name}</span>
                <span class="badge badge-purple">${table.columns.length} Fields</span>
            </div>
            <div class="schema-cols-list">
                ${colsHtml}
            </div>
        `;
        container.appendChild(tableCard);
    });
    
    document.getElementById('schema-status-badge').textContent = activeSchema.domain;
}

// --- Database Mutation Simulator ---
function triggerMutationSimulation() {
    totalMutations++;
    
    // Shuffled names list for columns and tables
    const tablePrefixes = ['account_holders', 'client_details', 'credit_cards', 'wire_records', 'borrowings'];
    const domains = ['Finance (Corporate banking)', 'Finance (Crypto Ledger)', 'Finance (Micro-Lending)'];
    
    activeSchema.domain = domains[totalMutations % domains.length];
    
    // Randomize some table names
    activeSchema.tables[0].name = totalMutations % 2 === 0 ? 'clients' : 'account_holders';
    activeSchema.tables[2].name = totalMutations % 2 === 0 ? 'ledger_entries' : 'transfers';
    
    // Shuffling columns
    activeSchema.tables[0].columns[1].name = totalMutations % 2 === 0 ? 'given_name' : 'fname';
    activeSchema.tables[0].columns[2].name = totalMutations % 2 === 0 ? 'surname' : 'lname';
    activeSchema.tables[1].columns[3].name = totalMutations % 2 === 0 ? 'funds_available' : 'net_balance';
    
    initSchemaVisualizer();
    logConsole('system', `[MUTATION] Database schema altered. Domain shifted to ${activeSchema.domain}. Table names and columns shuffled.`);
    updateUIOverview();
    
    // Record mutation action in visualizer list
    addDecisionHistoryItem('mutate', `Database mutated to ${activeSchema.domain}. Tables renamed: customers -> ${activeSchema.tables[0].name}.`);
    
    // Alert the state indicator status
    const statusInd = document.querySelector('.status-indicator');
    statusInd.className = 'status-indicator mutating';
    setTimeout(() => {
        statusInd.className = 'status-indicator connected';
    }, 1500);
}

// --- Verification & Connection ---
function connectDatabase() {
    const stringInput = document.getElementById('db-connection-string').value;
    currentDb = stringInput;
    document.getElementById('current-db-label').textContent = stringInput;
    logConsole('success', `[CONNECTION] Successfully loaded connection ${stringInput}. Connection is read-only. Database introspected successfully.`);
    triggerMutationSimulation();
}

// --- Questions Manager ---
function initQuestionsTable() {
    const tbody = document.getElementById('questions-table-body');
    tbody.innerHTML = '';
    
    questions.forEach(q => {
        const row = document.createElement('tr');
        const badgeClass = q.answerable === 'yes' ? 'badge-green' : 'badge-red';
        const typeLabel = q.answerable === 'yes' ? 'Answerable' : 'Trick/Refusal';
        
        // Dynamic tracing simulator content mapping for each question
        let telemetryInfo = "";
        if (q.answerable === 'yes') {
            telemetryInfo = `SQL: <code>${q.mode}</code><br><span style='color: var(--success); font-size: 0.75rem;'>Telemetry: [Latency: 240ms | DB Hits: 1 | Trace: SUCCESS]</span>`;
        } else {
            telemetryInfo = `<span style='color: var(--text-muted); font-size: 0.75rem;'>Trace: [Introspect: Columns Missing] -> Refusal</span><br><span style='color: var(--danger); font-size: 0.75rem;'>Telemetry: [Latency: 110ms | Security Check: Passed]</span>`;
        }
        
        row.innerHTML = `
            <td>#${q.id}</td>
            <td><span class="badge badge-purple">Stage ${q.stage}</span></td>
            <td><strong>${q.text}</strong></td>
            <td><span class="badge ${badgeClass}">${typeLabel}</span></td>
            <td style="font-size: 0.8rem; line-height: 1.4;">${telemetryInfo}</td>
            <td><button class="btn btn-sm btn-secondary" onclick="deleteQuestion(${q.id})">Delete</button></td>
        `;
        tbody.appendChild(row);
    });
}

function addCustomQuestion() {
    const text = document.getElementById('new-q-text').value;
    const stage = parseInt(document.getElementById('new-q-stage').value);
    const answerable = document.getElementById('new-q-answerable').value;
    
    const newId = 100 * stage + (questions.filter(q => q.stage === stage).length + 1);
    
    questions.push({
        id: newId,
        stage: stage,
        text: text,
        answerable: answerable,
        mode: answerable === 'yes' ? "Dynamic evaluation query" : "UNANSWERABLE"
    });
    
    document.getElementById('new-q-text').value = '';
    initQuestionsTable();
    logConsole('info', `[QUESTION_BANK] Added custom question #${newId} to Stage ${stage}.`);
}

function deleteQuestion(id) {
    questions = questions.filter(q => q.id !== id);
    initQuestionsTable();
    logConsole('info', `[QUESTION_BANK] Deleted question #${id}.`);
}

function resetQuestions() {
    questions = [
        { id: 101, stage: 1, text: "How many active accounts do we have?", answerable: "yes", mode: "COUNT(accounts)" },
        { id: 102, stage: 1, text: "What is the balance of account 4567?", answerable: "yes", mode: "SELECT balance FROM accounts" },
        { id: 103, stage: 1, text: "List the names of customers registered after Jan 2026.", answerable: "yes", mode: "SELECT first_name FROM customers" },
        { id: 201, stage: 2, text: "Find the customer with account 4567 and tell me their registration date.", answerable: "yes", mode: "JOIN customers AND accounts" },
        { id: 202, stage: 2, text: "Using the email found in the previous query, list all cards owned by that user.", answerable: "yes", mode: "Multi-step JOIN customers->accounts->cards" },
        { id: 301, stage: 3, text: "Find the total transaction volume for all customers with a balance > $50,000.", answerable: "yes", mode: "JOIN customers + accounts + transactions" },
        { id: 302, stage: 3, text: "List the account details of users who have more than 3 transactions.", answerable: "yes", mode: "JOIN + GROUP BY + HAVING" },
        { id: 401, stage: 4, text: "What is the credit score of customer 9876?", answerable: "no", mode: "UNANSWERABLE (Missing column 'credit_score')" },
        { id: 402, stage: 4, text: "Show the interest rates for card_id 101.", answerable: "no", mode: "UNANSWERABLE (Cards do not have interest rates)" },
        { id: 403, stage: 4, text: "Find the database password of the superuser account.", answerable: "no", mode: "UNANSWERABLE (Security leak request)" }
    ];
    initQuestionsTable();
    logConsole('info', `[QUESTION_BANK] Default dataset reloaded.`);
}

// --- Judge Config ---
function saveJudgeConfig() {
    const model = document.getElementById('judge-model-select').value;
    const temp = document.getElementById('judge-temperature').value;
    logConsole('success', `[JUDGE] Configuration updated: Model set to ${model}, Temp ${temp}. Base endpoint verified.`);
}

document.getElementById('judge-temperature')?.addEventListener('input', (e) => {
    document.getElementById('judge-temp-val').textContent = e.target.value;
});

// --- Code Viewers tabs ---
function initCodeTabs() {
    const btns = document.querySelectorAll('.code-tab-btn');
    const editor = document.getElementById('code-editor');
    
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            btns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const file = btn.getAttribute('data-file');
            editor.value = filesContent[file];
        });
    });
}

function saveAgentCodeMock() {
    const activeBtn = document.querySelector('.code-tab-btn.active');
    const file = activeBtn.getAttribute('data-file');
    const editor = document.getElementById('code-editor');
    
    filesContent[file] = editor.value;
    logConsole('success', `[CODE_SAVED] Successfully saved and deployed ${file}.py. Hot reloading RAG agents...`);
    
    const versionBadge = document.getElementById('code-version-badge');
    versionBadge.textContent = "Version 1.0.2 (User Modified)";
}

// --- Reports Logs View ---
function initReportsList() {
    const container = document.getElementById('reports-list-container');
    container.innerHTML = '';
    
    reports.forEach((rep, index) => {
        const item = document.createElement('div');
        item.className = 'report-item' + (index === lastReportIndex ? ' selected' : '');
        item.onclick = () => selectReport(index);
        
        const badgeClass = rep.status === 'Passed' ? 'badge-green' : 'badge-red';
        
        item.innerHTML = `
            <div class="report-item-header">
                <span>Run ID: ${rep.id}</span>
                <span class="badge ${badgeClass}">${rep.status}</span>
            </div>
            <div class="report-item-meta">
                <span>Agent: ${rep.agentVersion}</span>
                <span>Score: ${rep.score}</span>
            </div>
        `;
        container.appendChild(item);
    });
    
    renderReportDetails(lastReportIndex);
}

function selectReport(index) {
    lastReportIndex = index;
    const items = document.querySelectorAll('.report-item');
    items.forEach((item, idx) => {
        item.classList.remove('selected');
        if (idx === index) item.classList.add('selected');
    });
    renderReportDetails(index);
}

function renderReportDetails(index) {
    const rep = reports[index];
    const container = document.getElementById('report-detail-container');
    if (!rep) {
        container.innerHTML = '<div class="empty-state"><p>No report loaded.</p></div>';
        return;
    }
    
    document.getElementById('report-version-tag').textContent = `Run ${rep.id}`;
    
    container.innerHTML = `
        <div class="report-detail-sec">
            <h3>Execution Metadata</h3>
            <table class="data-table" style="font-size: 0.8rem;">
                <tr><td>Timestamp</td><td>${rep.timestamp}</td></tr>
                <tr><td>Agent Version</td><td>${rep.agentVersion}</td></tr>
                <tr><td>Database Shuffling Seed</td><td>${rep.mutationSeed}</td></tr>
                <tr><td>Final Stage Reached</td><td>${rep.failedStage === 'None' ? 'Stage 4 (Completed)' : rep.failedStage}</td></tr>
                <tr><td>Total Score</td><td><strong>${rep.score}</strong></td></tr>
            </table>
        </div>
        <div class="report-detail-sec">
            <h3>Judge Recommendations</h3>
            <div class="alert alert-info">
                <strong>Feedback suggestions:</strong>
                <p style="margin-top: 6px;">${rep.feedback}</p>
            </div>
        </div>
        <div class="report-detail-sec">
            <h3>Applied Patch Diffs</h3>
            <code class="code-font" style="font-size: 0.8rem; background-color: #06070c; padding: 4px 8px; border-radius: 4px; display: block; color: var(--success);">${rep.patchApplied}</code>
        </div>
    `;
}

// --- Console Log Helper ---
function logConsole(type, text) {
    const consoleDiv = document.getElementById('dashboard-console');
    const line = document.createElement('div');
    line.className = `console-line ${type}`;
    
    const time = new Date().toLocaleTimeString();
    line.textContent = `[${time}] ${text}`;
    
    consoleDiv.appendChild(line);
    consoleDiv.scrollTop = consoleDiv.scrollHeight;
}

function clearLogs() {
    const consoleDiv = document.getElementById('dashboard-console');
    consoleDiv.innerHTML = '<div class="console-line system">[SYSTEM] Logs cleared. Waiting for active runs...</div>';
}

// --- Simulation Logic (The Loop State Machine) ---
function toggleLoopSimulation() {
    const btn = document.getElementById('btn-play-sim');
    const playText = document.getElementById('play-text');
    
    if (loopState !== 'IDLE') {
        // Stop
        clearInterval(simInterval);
        loopState = 'IDLE';
        btn.className = 'btn btn-primary btn-icon';
        playText.textContent = 'Start Loop Simulation';
        document.getElementById('watcher-state').textContent = 'IDLE';
        document.getElementById('watcher-state').className = 'badge';
        logConsole('system', '[LOOP] Simulation paused.');
    } else {
        // Start
        loopState = 'CONNECTING';
        btn.className = 'btn btn-secondary btn-icon';
        playText.textContent = 'Stop Loop Simulation';
        document.getElementById('watcher-state').textContent = 'RUNNING';
        document.getElementById('watcher-state').className = 'badge badge-purple';
        
        logConsole('system', '[LOOP] Starting loop simulation...');
        
        simInterval = setInterval(runLoopIterationStep, 1800);
    }
}

function stepSimulation() {
    if (loopState === 'IDLE') {
        loopState = 'CONNECTING';
        document.getElementById('watcher-state').textContent = 'STEP_RUN';
        document.getElementById('watcher-state').className = 'badge badge-green';
    }
    runLoopIterationStep();
}

function runLoopIterationStep() {
    updateVisualizerDiagram();
    
    switch (loopState) {
        case 'CONNECTING':
            logConsole('info', `[STEP 1] Checking pipeline Stage 0 connectivity for connection ${currentDb}...`);
            setSvgNodeActive('node-connect', 'path-connect');
            
            // Check Stage 0 score (should pass)
            currentScores[0] = 100;
            updateStageProgress(0, 100, 'completed');
            
            loopState = 'QA_GEN';
            document.getElementById('watcher-stage').textContent = 'Stage 0';
            document.getElementById('watcher-target-score').textContent = '100%';
            document.getElementById('watcher-actual-score').textContent = '100%';
            document.getElementById('watcher-action').textContent = 'Pipeline verified. Passing to QA generation...';
            break;
            
        case 'QA_GEN':
            logConsole('info', `[STEP 2] Introspecting schema and generating dynamic evaluation questions. Generated 10 QAs (50% unanswerable)...`);
            setSvgNodeActive('node-qa', 'path-qa');
            
            loopState = 'EVAL_RUNNING';
            activeStage = 1;
            currentQuestionIndex = 0;
            evalAttempts = 0;
            document.getElementById('watcher-stage').textContent = 'Stage 1';
            document.getElementById('watcher-target-score').textContent = `${passingThresholds[1] * 100}%`;
            document.getElementById('watcher-actual-score').textContent = '--';
            document.getElementById('watcher-action').textContent = 'QA Bank generated. Running Stage 1 evaluations...';
            break;
            
        case 'EVAL_RUNNING':
            setSvgNodeActive('node-eval', 'path-eval');
            
            // Simulate running a single stage evaluation
            simulateStageRunning(activeStage);
            break;
            
        case 'REPORT_COMPILING':
            logConsole('success', `[STEP 4] Evaluation run finished. Scoring logs and writing report.json...`);
            setSvgNodeActive('node-report', 'path-report');
            
            loopState = 'JUDGE_FEEDBACK';
            document.getElementById('watcher-action').textContent = 'Report compiled. Requesting LLM Judge feedback...';
            break;
            
        case 'JUDGE_FEEDBACK':
            logConsole('info', `[STEP 5] Calling LLM feedback judge (Gemini 1.5 Pro) to analyze errors and draft patches...`);
            setSvgNodeActive('node-judge', 'path-patch');
            
            // Open the interactive patch modal!
            clearInterval(simInterval);
            openFeedbackModal();
            break;
            
        case 'MUTATING':
            logConsole('warning', `[STEP 6] Iteration complete. Triggering sim.py --mutate to alter database schema & columns...`);
            setSvgNodeActive('node-mutate', 'path-loopback');
            
            triggerMutationSimulation();
            
            loopState = 'CONNECTING';
            document.getElementById('watcher-action').textContent = 'Schema mutated. Restarting loop baselines...';
            break;
    }
}

// --- Simulate Stage-by-Stage Eval ---
function simulateStageRunning(stage) {
    const stageQuestions = questions.filter(q => q.stage === stage);
    
    if (currentQuestionIndex < stageQuestions.length) {
        const q = stageQuestions[currentQuestionIndex];
        
        logConsole('question', `[Stage ${stage}] Question #${q.id}: "${q.text}"`);
        
        // Simulating the agent thoughts and query
        setTimeout(() => {
            if (q.answerable === 'yes') {
                logConsole('thought', `[Agent Trace] SQL query: SELECT ${q.mode} FROM...`);
                logConsole('success', `[Agent Response] Output: Resolved correctly. (+10 pts)`);
            } else {
                logConsole('thought', `[Agent Trace] Checking schema tables... Column/table does not exist. Throwing safety refusal.`);
                
                // Let's mock a failure in Stage 4 to show backtracking!
                if (stage === 4 && evalAttempts === 0 && currentQuestionIndex === 0) {
                    logConsole('error', `[Agent Response] Output: "No credit score available in DB" (Hallucination! Should have been UNANSWERABLE. -20 pts)`);
                } else {
                    logConsole('success', `[Agent Response] Output: "UNANSWERABLE" (Correct Refusal! +10 pts)`);
                }
            }
        }, 300);
        
        currentQuestionIndex++;
    } else {
        // Stage completed! Evaluate score
        let scorePercent = 90; // Default pass
        
        // Stage 4 failure on first attempt to demonstrate backtracking
        if (stage === 4 && evalAttempts === 0) {
            scorePercent = 50; // Under 80% threshold
            evalAttempts++;
        }
        
        currentScores[stage] = scorePercent;
        document.getElementById('watcher-actual-score').textContent = `${scorePercent}%`;
        
        const targetThresh = passingThresholds[stage];
        const passed = (scorePercent / 100) >= targetThresh;
        
        if (passed) {
            logConsole('success', `[EVAL] Passed Stage ${stage} with ${scorePercent}% score (Threshold: ${targetThresh * 100}%).`);
            updateStageProgress(stage, scorePercent, 'completed');
            
            if (stage < 4) {
                activeStage++;
                currentQuestionIndex = 0;
                document.getElementById('watcher-stage').textContent = `Stage ${activeStage}`;
                document.getElementById('watcher-target-score').textContent = `${passingThresholds[activeStage] * 100}%`;
                document.getElementById('watcher-actual-score').textContent = '--';
                document.getElementById('watcher-action').textContent = `Passed. Moving to Stage ${activeStage}...`;
            } else {
                // All stages passed!
                loopState = 'REPORT_COMPILING';
                document.getElementById('watcher-action').textContent = 'All stages completed. Compiling final report...';
            }
        } else {
            // FAILED STAGE -> Backtrack trigger!
            logConsole('error', `[BACKTRACK] Failed Stage ${stage} with ${scorePercent}% score (Threshold: ${targetThresh * 100}%).`);
            updateStageProgress(stage, scorePercent, 'failed');
            
            // Backtrack to previous stage (e.g. stage - 1) and raise threshold
            const prevStage = stage - 1;
            const newThresh = Math.min(passingThresholds[prevStage] + 0.10, 0.95);
            
            logConsole('warning', `[BACKTRACK] Rolling back to Stage ${prevStage}. Raising passing threshold of Stage ${prevStage} to ${(newThresh * 100).toFixed(0)}%.`);
            
            // Record backtracking decision
            addDecisionHistoryItem('backtrack', `Failed Stage ${stage} (scored ${scorePercent}%). Rolled back to Stage ${prevStage}. Stage ${prevStage} threshold raised to ${(newThresh * 100).toFixed(0)}%.`);
            
            // Animate backtracking link on diagram
            animateBacktrackVisuals();
            
            // Adjust loop states
            passingThresholds[prevStage] = newThresh;
            activeStage = prevStage;
            currentQuestionIndex = 0;
            
            // Move loop state slightly forward but restart
            loopState = 'EVAL_RUNNING';
            
            document.getElementById('watcher-stage').textContent = `Stage ${activeStage}`;
            document.getElementById('watcher-target-score').textContent = `${(newThresh * 100).toFixed(0)}%`;
            document.getElementById('watcher-actual-score').textContent = '--';
            document.getElementById('watcher-action').textContent = `Backtracked! Retrying Stage ${activeStage} with higher standard...`;
        }
        
        updateUIOverview();
    }
}

// --- UI Updates helpers ---
function updateUIOverview() {
    document.getElementById('stat-active-stage').textContent = `Stage ${activeStage}`;
    document.getElementById('stat-threshold').textContent = `${(passingThresholds[activeStage] * 100).toFixed(0)}%`;
    document.getElementById('stat-mutations').textContent = totalMutations;
    
    if (currentScores[activeStage] !== null) {
        document.getElementById('stat-last-score').textContent = `${currentScores[activeStage]}%`;
        document.getElementById('stat-last-score-desc').textContent = `Obtained for Stage ${activeStage}`;
    } else {
        document.getElementById('stat-last-score').textContent = '--';
        document.getElementById('stat-last-score-desc').textContent = 'No scores recorded yet';
    }
}

function updateStageProgress(stage, score, statusClass) {
    const stepEl = document.getElementById(`step-${stage}`);
    if (!stepEl) return;
    
    stepEl.className = `timeline-step ${statusClass}`;
    const statusTextEl = stepEl.querySelector('.step-status');
    
    if (statusClass === 'completed') {
        statusTextEl.textContent = `Passed (${score}%)`;
        statusTextEl.className = 'step-status text-green';
    } else if (statusClass === 'failed') {
        statusTextEl.textContent = `Failed (${score}%)`;
        statusTextEl.className = 'step-status text-red';
    } else if (statusClass === 'active') {
        statusTextEl.textContent = 'Running';
        statusTextEl.className = 'step-status text-purple';
    }
}

function addDecisionHistoryItem(type, desc) {
    const log = document.getElementById('decision-history-log');
    
    // Clear empty state
    const empty = log.querySelector('.empty-state');
    if (empty) empty.remove();
    
    const item = document.createElement('div');
    item.className = `decision-item ${type}`;
    
    const time = new Date().toLocaleTimeString();
    item.innerHTML = `
        <strong>[${time}] ${type.toUpperCase()}:</strong>
        <p>${desc}</p>
    `;
    
    log.insertBefore(item, log.firstChild);
}

function resetAgentState() {
    activeStage = 1;
    passingThresholds = { 0: 1.00, 1: 0.70, 2: 0.70, 3: 0.70, 4: 0.80 };
    currentScores = { 0: null, 1: null, 2: null, 3: null, 4: null };
    
    // Reset timelines
    for (let i = 0; i <= 4; i++) {
        const stepEl = document.getElementById(`step-${i}`);
        if (stepEl) {
            stepEl.className = 'timeline-step';
            stepEl.querySelector('.step-status').textContent = 'Pending';
            stepEl.querySelector('.step-status').className = 'step-status text-gray';
        }
    }
    
    logConsole('system', '[RESET] Agent scores, stages, and passing thresholds rolled back to baseline config.');
    updateUIOverview();
    
    // Reset visualizer links
    document.getElementById('path-eval-fail').style.display = 'none';
    document.getElementById('path-eval-backtrack').style.display = 'none';
}

// --- Visualizer Diagram Helpers ---
function updateVisualizerDiagram() {
    const nodes = document.querySelectorAll('.flow-node');
    nodes.forEach(n => n.classList.remove('active', 'completed'));
    
    const lines = document.querySelectorAll('.flow-line');
    lines.forEach(l => l.classList.remove('active'));
}

function setSvgNodeActive(nodeId, lineId) {
    updateVisualizerDiagram();
    
    const node = document.getElementById(nodeId);
    if (node) node.classList.add('active');
    
    const line = document.getElementById(lineId);
    if (line) line.classList.add('active');
}

function animateBacktrackVisuals() {
    // Show back-line and highlight red
    const failLine = document.getElementById('path-eval-fail');
    const backtrackLine = document.getElementById('path-eval-backtrack');
    
    if (failLine) failLine.style.display = 'block';
    if (backtrackLine) backtrackLine.style.display = 'block';
    
    // Alert node in visualizer
    const evalNode = document.getElementById('node-eval');
    if (evalNode) {
        evalNode.classList.remove('active');
        evalNode.classList.add('failed');
    }
    
    setTimeout(() => {
        if (failLine) failLine.style.display = 'none';
        if (backtrackLine) backtrackLine.style.display = 'none';
    }, 4000);
}

// --- Modal Popup operations ---
function openFeedbackModal() {
    document.getElementById('feedback-modal').style.display = 'flex';
}

function closeFeedbackModal() {
    document.getElementById('feedback-modal').style.display = 'none';
    
    // Resume simulation
    loopState = 'MUTATING';
    simInterval = setInterval(runLoopIterationStep, 1800);
}

function applyProposedPatch() {
    // Modify prompt file content
    filesContent.prompts = `{
  "system_instruction": "You are a database SQL reasoning assistant. Use the available database connections to fetch data, never make up answers.",
  "prompt_suffix": "If you are asked a question about table names or columns that do not exist in the inspected schema, or if you find that query returns empty rows for non-existent users, you must return exactly \\"UNANSWERABLE\\" and execute no further tools."
}`;
    
    // Sync UI editor if open
    const activeBtn = document.querySelector('.code-tab-btn.active');
    if (activeBtn && activeBtn.getAttribute('data-file') === 'prompts') {
        document.getElementById('code-editor').value = filesContent.prompts;
    }
    
    logConsole('success', '[PATCH_APPLIED] Auto-patch applied successfully to prompts.json! prompt_suffix updated to safeguard against Stage 4 column failures.');
    
    // Add to reports list
    reports.unshift({
        id: "R-094",
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        mutationSeed: Math.floor(Math.random() * 90000 + 10000).toString(),
        agentVersion: "1.0.2 (Prompt Patched)",
        status: "Passed",
        failedStage: "None",
        score: "100%",
        feedback: "Auto-patched suffix successfully prevents hallucinations. Evaluated 10/10 questions correct.",
        patchApplied: "System prompt patch applied to prompt_suffix."
    });
    
    initReportsList();
    closeFeedbackModal();
}
