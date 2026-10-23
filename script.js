import {
    finalizeBlockRandomization,
    firebaseUserId,
    writeRealtimeDatabase,
    writeURLParameters,
} from "./firebasepsych.js";

console.log(firebaseUserId);

/*
data saved as FirebaseID /
1. pid: Prolific URL parameters
2. exp: experiment-wide data
3. trial: trial data
*/

const debug = true;

// constants
const numTrial = 30;

const studyId = "nat2indep";
const dbPath = studyId + "/participantData/" + firebaseUserId + "/";

const redirectURL = "https://app.prolific.com/submissions/complete?cc=C1P1YP97";
const expData = {}; // experiment-wide data

const allTrialData = [] // all trial data as backup
const errorTrialIdx = [] // error trial numbers

// variables
let trialData; // trial-level data
let aiData;

let isIntro;
let introTimer;

let curTrial = 1;
let curScore = 0;

let cat1Score = 0;
let cat2Score = 0;

let curTrialPer = 0;
let curScorePer = 0;

let warnOnLeave = false;
let submitting = false;

let consentRemaining = 5;
let dataReady = false;

// consent
const consent = document.querySelector(".consent");
const consentCheckbox = document.querySelector(".consentCheckbox");
const startButton = document.querySelector(".startButton");

// experiment
const experiment = document.querySelector(".experiment");
const trial = document.querySelector(".trial");
const question = document.querySelector(".question");

const humanForm = document.querySelector(".humanForm");
const humanField = document.querySelector(".humanField");
const humanSubmit = document.querySelector(".humanSubmit");

const imageDisplay = document.querySelector(".imageDisplay");
const stimuliDisplay = document.querySelector(".stimuliDisplay");
const questionCat = document.querySelector(".questionCat");

// complete
const complete = document.querySelector(".complete");

const commentDisplay = document.querySelector(".commentDisplay");
const commentField = document.getElementById("commentField");
const commentSubmit = document.querySelector(".commentSubmit");

const redirectDisplay = document.querySelector(".redirectDisplay");
const redirectButton = document.querySelector(".redirectButton");

const catEmj = document.querySelectorAll(".catEmj");
const mainDisplay = document.querySelector(".mainDisplay");

// helpers
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const timePassed = () => Math.round(performance.now());

const writeRetry = async (path, data, tries = 3, timeoutMs = 10000) => {
    for (let attempt = 1; attempt <= tries; attempt++) {
        let timer;
        try {
            await Promise.race([
                writeRealtimeDatabase(path, data),
                new Promise((_, reject) => {
                    timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
                }),
            ]);
            return true;
        } catch (error) {
            console.error(`Error writing to ${path} (attempt ${attempt}):`, error);
            if (attempt < tries) await sleep(1000 * attempt);
        } finally {
            clearTimeout(timer);
        }
    }
    return false;
};

function countdownNext(seconds = 2) {
    const btn = document.querySelector(".introjs-nextbutton");
    if (!btn) return;

    clearInterval(introTimer);
    let remaining = seconds;

    const setLocked = (locked) => {
        btn.classList.toggle("introjs-disabled", locked);
        btn.style.pointerEvents = locked ? "none" : "auto";
        btn.setAttribute("tabindex", locked ? "-1" : "0");
    };

    setLocked(true);
    btn.textContent = `Next (${remaining}s)`;

    introTimer = setInterval(() => {
        btn.textContent = --remaining > 0 ? `Next (${remaining}s)` : "Next";
        if (remaining <= 0) {
            clearInterval(introTimer);
            setLocked(false);
        }
    }, 1000);
}

const getData = async (dataPath) => {
    try {
        const response = await fetch(dataPath);
        if (!response.ok) {
            throw new Error(`Response status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error(error.message);
    }
};

const displayTrial = (cat) => {
    if (cat === "Plants") {
        catEmj.forEach((emj) => (emj.textContent = "🌱"));

        imageDisplay.src =
            "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Rosa_rubiginosa_1.jpg/330px-Rosa_rubiginosa_1.jpg";
        questionCat.textContent = `Rosa rubiginosa`;
    } else {
        console.assert(cat === "Fungi");

        catEmj.forEach((emj) => (emj.textContent = "🍄"));

        imageDisplay.src =
            "https://upload.wikimedia.org/wikipedia/commons/thumb/3/34/Boletus_edulis_IT.jpg/500px-Boletus_edulis_IT.jpg";
        questionCat.textContent = `Boletus edulis`;
    }
};

const resetTrial = async () => {
    trialData = structuredClone(aiData[curTrial - 1]);
    trialData.startTime = timePassed();

    trialData.trial = curTrial;

    humanForm.reset();

    humanField.disabled = true;
    submitting = false

    if (trialData.cat === "Plants") {
        catEmj.forEach((emj) => (emj.textContent = "🌱"));
    } else {
        console.assert(trialData.cat === "Fungi");

        catEmj.forEach((emj) => (emj.textContent = "🍄"));
    }

    questionCat.textContent = "Thinking...";
    imageDisplay.src = trialData.path;

    await sleep(1000);

    questionCat.textContent = trialData.aiAns;

    humanField.disabled = false;
    humanSubmit.disabled = true;
};

// onboarding
function updateStartButton() {
    startButton.disabled = consentRemaining > 0 || !consentCheckbox.checked || !dataReady;
    startButton.textContent = consentRemaining > 0 ? `Start (${consentRemaining}s)`
        : dataReady ? "Start" : "Loading...";
}

updateStartButton();
consentCheckbox.onchange = updateStartButton;

const consentTimer = setInterval(() => {
    consentRemaining--;
    if (consentRemaining <= 0) clearInterval(consentTimer);
    updateStartButton();
}, 1000);


startButton.onclick = async () => {
    warnOnLeave = true;
    expData.startTime = Date.now();

    consent.classList.add("d-none");
    experiment.classList.remove("d-none");

    isIntro = true;
    displayTrial("Plants");

    let intro = introJs();
    let steps = [
        {
            title: "Task",
            intro:
                `<p>You'll get ${numTrial} photos of Plants 🌱 or Fungi 🍄 with a species name. Decide whether the name matches the photo.</p>
             <p><strong>Use only your own knowledge</strong>: no search engines or AI. It's okay not to know; make your best guess.</p>`,
        },
        {
            title: "Plants 🌱",
            element: mainDisplay,
            intro: "<p>Example: a Plant 🌱 photo with a species name.</p>",
        },
        {
            title: "Fungi 🍄",
            element: mainDisplay,
            intro: "<p>Example: a Fungus 🍄 photo with a species name.</p>",
        },
        {
            title: "Answer",
            element: humanForm,
            intro:
                "<p>Select <strong>Correct</strong> if the name matches the photo, or <strong>Wrong</strong> " +
                "if it doesn't. Then click <strong>Submit</strong>.</p>",
        },
        {
            title: "Ready",
            element: trial,
            intro: "<p>The counter shows your progress. Let's begin!</p>",
        },
    ];
    intro
        .setOptions({
            exitOnEsc: false,
            exitOnOverlayClick: false,
            showBullets: debug,
            keyboardNavigation: debug,
            steps,
        })
        .onbeforechange(() => {
            let step = intro.currentStep();
            let chxIdx = 1;

            if (step === chxIdx) {
                displayTrial("Plants");
            } else if (step === chxIdx + 1) {
                displayTrial("Fungi");
            }
        })
        .oncomplete(() => {
            isIntro = false;
            resetTrial();
        })
        .onafterchange(() => countdownNext())
        .start();
};

humanForm.oninput = () => {
    if (!isIntro) {
        humanSubmit.disabled = !humanForm.checkValidity();
    }
};


humanForm.onsubmit = async (event) => {
    event.preventDefault();

    if (submitting) return;
    submitting = true;

    humanSubmit.disabled = true;
    trialData.humanTime = timePassed();

    let humanAns = document.querySelector('input[name="humanAns"]:checked').value;
    trialData.humanAns = humanAns;

    let aiCor = trialData.aiCor;

    if ((aiCor && humanAns === "yes") || (!aiCor && humanAns === "no")) {
        curScore++;
        trialData.correct = true;

        if (trialData.cat === "Plants") cat1Score++;
        else cat2Score++;
    } else {
        trialData.correct = false;
    }

    curScorePer = Math.round((curScore / curTrial) * 100);
    trialData.endTime = timePassed();

    if (debug) {
        console.log(trialData);
    }

    allTrialData.push(trialData);

    humanSubmit.textContent = "Saving...";
    humanField.disabled = true;

    const ok = await writeRetry(dbPath + "/trial/" + curTrial, trialData);
    humanSubmit.textContent = "Submit";

    if (!ok) {
        errorTrialIdx.push(curTrial);
        console.error("Failed to write trial data");
    }

    curTrial++;
    curTrialPer = Math.round((curTrial / numTrial) * 100);

    trial.textContent = `Trial ${curTrial}/${numTrial}: `;

    if (curTrial <= numTrial) {
        resetTrial();
    } else {
        experiment.classList.add("d-none");
        complete.classList.remove("d-none");

        await writeRetry(dbPath + "/trialBackup", allTrialData);

        expData.score = curScore;

        expData.cat1Score = cat1Score;
        expData.cat2Score = cat2Score;
    }
};

commentSubmit.onclick = async () => {
    commentSubmit.disabled = true;
    commentField.disabled = true;

    expData.comment = commentField.value;
    expData.endTime = Date.now();

    expData.errorTrialIdx = errorTrialIdx;
    await writeRetry(dbPath + "/exp", expData);

    try {
        await finalizeBlockRandomization(studyId, "nat");
    } catch (error) {
        console.error(error);
    }

    warnOnLeave = false;

    commentDisplay.classList.add("d-none");
    redirectDisplay.classList.remove("d-none");

    await sleep(2000);
    window.location.replace(redirectURL);
};

redirectButton.onclick = () => {
    window.location.replace(redirectURL);
};

// initialize
writeURLParameters(dbPath + "/pid");

trial.textContent = `Trial ${curTrial}/${numTrial}: `;

let [data1, data2] = await Promise.all([
    getData("Plants.json"),
    getData("Fungi.json"),
]);

data1 = _.sampleSize(data1, numTrial / 2);
data2 = _.sampleSize(data2, numTrial / 2);

// randomized
aiData = [...data1, ...data2];
aiData = _.shuffle(aiData);

if (aiData.length === numTrial) {
    dataReady = true;
    updateStartButton();
} else {
    startButton.textContent = "Error loading data — please refresh";
}

window.addEventListener("beforeunload", (event) => {
    if (warnOnLeave) event.preventDefault();
});

if (debug) {
    console.log(aiData);
}




