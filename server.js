// =============================================
// FOOTBALL LIVE SERVER
// =============================================

require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

require.extensions[".ts"] = require.extensions[".js"];

const app = express();


// =============================================
// SETTINGS
// =============================================

const PORT = process.env.PORT || 8000;
const DEFAULT_DESIGN_SETTINGS_DB_PATH = path.join(__dirname, "data", "design-settings.sqlite");
const DESIGN_SETTINGS_DB_PATH = path.resolve(
    process.env.DESIGN_SETTINGS_DB_PATH || DEFAULT_DESIGN_SETTINGS_DB_PATH
);
const DEFAULT_GLOBAL_MATCH_STYLE = {
    fontFamily: "",
    fontSize: null,
    fontWeight: null,
    textColor: "",
    backgroundColor: "",
    borderColor: "",
    borderWidth: null,
    borderRadius: null,
    padding: null,
    cardWidth: null,
    cardHeight: null,
    logoSize: null,
    teamSpacing: null,
    scoreSize: null,
    shadow: "",
    opacity: null,
    dragOffsets: {},
    elementStyles: {}
};

fs.mkdirSync(path.dirname(DESIGN_SETTINGS_DB_PATH), { recursive: true });
if (
    DESIGN_SETTINGS_DB_PATH !== path.resolve(DEFAULT_DESIGN_SETTINGS_DB_PATH) &&
    !fs.existsSync(DESIGN_SETTINGS_DB_PATH) &&
    fs.existsSync(DEFAULT_DESIGN_SETTINGS_DB_PATH)
) {
    fs.copyFileSync(DEFAULT_DESIGN_SETTINGS_DB_PATH, DESIGN_SETTINGS_DB_PATH);
}
const designSettingsDb = new DatabaseSync(DESIGN_SETTINGS_DB_PATH);
designSettingsDb.exec(`
    CREATE TABLE IF NOT EXISTS design_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        global_match_style TEXT NOT NULL,
        elements TEXT NOT NULL,
        backgrounds TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
`);

const GOAL_API_KEY =
    process.env.GOAL_API_KEY;

const HAS_API_KEY =
    Boolean(GOAL_API_KEY) &&
    GOAL_API_KEY !== "YOUR_GOAL_API_KEY_HERE";

const API_URL =
    "https://api.goal-api.com/v1";

const BZZOIRO_API_URL =
    "https://sports.bzzoiro.com/api/v2";

const BZZOIRO_API_KEY =
    process.env.BZZOIRO_API_KEY || "";

const FALLBACK_LOGO_PATH =
    path.join(__dirname, "site-logo.svg");

app.use(
    express.json({ limit: "25mb" })
);

function normalizeLogoLookupKey(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim()
        .replace(/\s+/g, " ");
}

function nationalTeamLogoLookupKey(value) {
    return normalizeLogoLookupKey(value)
        .replace(/\b(?:u[\s.-]*17|under[\s.-]*17|women(?: s)?|female|girls?|w|national|team)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
}

const FOOTBALL_LOGOS_COMMIT = "5d221dfa6849a01dced71c389eb1eafe83ce51e2";
const FOOTBALL_LOGOS_BASE_URL =
    `https://raw.githubusercontent.com/JoseArroyave/football-logos/${FOOTBALL_LOGOS_COMMIT}/logos`;
const FOOTBALL_LOGO_CATALOG = JSON.parse(
    fs.readFileSync(path.join(__dirname, "football-logo-catalog.json"), "utf8").replace(/^\uFEFF/, "")
);
const FOOTBALL_LOGO_COUNTRY_FILES = new Map();
const FOOTBALL_LOGO_GLOBAL_FILES = new Map();
const FOOTBALL_LOGO_TEAM_ASSETS = [];
const FOOTBALL_LOGO_TEAM_TOKEN_INDEX = new Map();
const FOOTBALL_LOGO_COMPETITION_COUNTRY_FILES = new Map();
const FOOTBALL_LOGO_COMPETITION_GLOBAL_FILES = new Map();
const FOOTBALL_LOGO_TOURNAMENT_FILES = new Map();
const FOOTBALL_LOGO_COMPETITION_ASSETS = [];
const FOOTBALL_LOGO_COUNTRIES = new Set();
const FOOTBALL_LOGO_COMPETITION_FILE_PATTERN = /(?:league|liga|ligue|cup|copa|coppa|division|divisie|championship|championnat|bundesliga|serie|super.?lig|botola|eredivisie|primeira|segunda|jupiler|trophy|premier|stars|pro.?league|football.?league|national(?:\s+\d+|\s+division)|super.?cup|supercup|knvb|mls|pokal|taca\s+de\s+portugal|community\s+shield|\b[1-3](?:st|nd|rd)?\s+lig\b)/i;
const FOOTBALL_LOGO_PREFIXES = ["association football club", "football club", "club de futbol", "club", "ssc", "afc", "fc", "cf", "sc", "ac", "as", "rcd", "rc", "cd", "ud", "sd", "nk", "fk", "bk", "sk"];
const FOOTBALL_LOGO_SUFFIXES = ["football club", "sports club", "sporting club", "club", "fc", "cf", "afc", "sc", "ac", "as", "rcd", "rc", "cd", "ud", "sd", "nk", "fk", "bk", "sk"];
const FOOTBALL_LOGO_NAME_STOP_WORDS = new Set(["a", "and", "association", "club", "de", "del", "fc", "football", "of", "sc", "the"]);

function getFootballLogoNameKeys(value) {
    const initialKey = normalizeLogoLookupKey(value);
    if (!initialKey) return [];
    const normalizedVariants = [
        initialKey,
        initialKey
            .replace(/\butd\b/g, "united")
            .replace(/\bmunchen\b|\bmuenchen\b/g, "munich")
            .replace(/\bahli\b/g, "ahly")
            .replace(/\bath\b/g, "athletic")
            .replace(/\bdep\b/g, "deportivo")
            .replace(/\b(?:of|the|de|del|da|do)\b/g, " ")
            .replace(/\s+/g, " ")
            .trim()
    ].filter(Boolean);
    const keys = new Set(normalizedVariants);
    for (const key of normalizedVariants) {
        let strippedPrefix = "";
        let strippedSuffix = "";
        for (const prefix of FOOTBALL_LOGO_PREFIXES) {
            if (!key.startsWith(`${prefix} `)) continue;
            strippedPrefix = key.slice(prefix.length + 1);
            if (strippedPrefix) keys.add(strippedPrefix);
            break;
        }
        for (const suffix of FOOTBALL_LOGO_SUFFIXES) {
            if (!key.endsWith(` ${suffix}`)) continue;
            strippedSuffix = key.slice(0, -(suffix.length + 1));
            if (strippedSuffix) keys.add(strippedSuffix);
            break;
        }
        if (strippedPrefix && strippedSuffix) {
            const strippedPrefixAndSuffix = strippedPrefix.slice(0, -(key.length - strippedSuffix.length));
            if (strippedPrefixAndSuffix) keys.add(strippedPrefixAndSuffix);
        }
    }
    return [...keys];
}

function addFootballLogoFileIndex(index, key, logoUrl) {
    if (!index.has(key)) index.set(key, new Set());
    index.get(key).add(logoUrl);
}

for (const logoPath of FOOTBALL_LOGO_CATALOG) {
    const [country, fileName] = logoPath.split("/");
    if (!country || !fileName || fileName.endsWith("_National_Team.svg")) continue;
    const logoUrl = `${FOOTBALL_LOGOS_BASE_URL}/${logoPath.split("/").map(encodeURIComponent).join("/")}`;
    const baseName = fileName.replace(/\.svg$/i, "");
    const fileKeys = getFootballLogoNameKeys(baseName);
    const isTournament = country === "tournaments";
    const isCountryCompetition = !isTournament
        && FOOTBALL_LOGO_COMPETITION_FILE_PATTERN.test(normalizeLogoLookupKey(baseName));

    if (isTournament || isCountryCompetition) {
        if (isCountryCompetition) FOOTBALL_LOGO_COUNTRIES.add(country);
        const index = isTournament ? FOOTBALL_LOGO_TOURNAMENT_FILES : FOOTBALL_LOGO_COMPETITION_GLOBAL_FILES;
        for (const key of fileKeys) addFootballLogoFileIndex(index, key, logoUrl);
        FOOTBALL_LOGO_COMPETITION_ASSETS.push({
            country: isTournament ? "" : country,
            logoUrl,
            name: normalizeLogoLookupKey(baseName)
        });
        if (isCountryCompetition) {
            if (!FOOTBALL_LOGO_COMPETITION_COUNTRY_FILES.has(country)) {
                FOOTBALL_LOGO_COMPETITION_COUNTRY_FILES.set(country, new Map());
            }
            for (const key of fileKeys) {
                addFootballLogoFileIndex(FOOTBALL_LOGO_COMPETITION_COUNTRY_FILES.get(country), key, logoUrl);
            }
        }
        continue;
    }

    FOOTBALL_LOGO_COUNTRIES.add(country);
    if (!FOOTBALL_LOGO_COUNTRY_FILES.has(country)) FOOTBALL_LOGO_COUNTRY_FILES.set(country, new Map());
    for (const key of fileKeys) {
        addFootballLogoFileIndex(FOOTBALL_LOGO_COUNTRY_FILES.get(country), key, logoUrl);
        addFootballLogoFileIndex(FOOTBALL_LOGO_GLOBAL_FILES, key, logoUrl);
    }
    const asset = {
        country,
        logoUrl,
        tokens: new Set(normalizeLogoLookupKey(baseName).split(" ").filter(token => !FOOTBALL_LOGO_NAME_STOP_WORDS.has(token)))
    };
    FOOTBALL_LOGO_TEAM_ASSETS.push(asset);
    for (const token of asset.tokens) {
        if (!FOOTBALL_LOGO_TEAM_TOKEN_INDEX.has(token)) FOOTBALL_LOGO_TEAM_TOKEN_INDEX.set(token, new Set());
        FOOTBALL_LOGO_TEAM_TOKEN_INDEX.get(token).add(asset);
    }
}

const FOOTBALL_LOGO_COUNTRY_ALIASES = new Map([
    ["united kingdom", "england"], ["great britain", "england"], ["united states", "usa"],
    ["ivory coast", "cote-d-ivoire"], ["cote d ivoire", "cote-d-ivoire"],
    ["south korea", "south-korea"], ["united arab emirates", "uae"],
    ["saudi arabia", "saudi-arabia"], ["uae", "uae"], ["usa", "usa"],
    ["gb", "england"], ["uk", "england"], ["es", "spain"], ["de", "germany"],
    ["fr", "france"], ["it", "italy"], ["ma", "morocco"], ["dz", "algeria"],
    ["eg", "egypt"], ["sa", "saudi-arabia"], ["us", "usa"], ["ci", "cote-d-ivoire"],
    ["kr", "south-korea"], ["ae", "uae"], ["br", "brazil"], ["ar", "argentina"],
    ["pt", "portugal"], ["nl", "netherlands"], ["be", "belgium"], ["tr", "turkey"],
    ["tn", "tunisia"], ["qa", "qatar"], ["iq", "iraq"], ["jo", "jordan"],
    ["za", "south-africa"], ["ng", "nigeria"], ["jp", "japan"], ["cn", "china"],
    ["إسبانيا", "spain"], ["ألمانيا", "germany"], ["فرنسا", "france"],
    ["إيطاليا", "italy"], ["المغرب", "morocco"], ["الجزائر", "algeria"],
    ["مصر", "egypt"], ["السعودية", "saudi-arabia"], ["إنجلترا", "england"]
].map(([country, slug]) => [normalizeLogoLookupKey(country), slug]));
for (const countrySlug of FOOTBALL_LOGO_COUNTRIES) {
    FOOTBALL_LOGO_COUNTRY_ALIASES.set(countrySlug.replace(/-/g, " "), countrySlug);
}
const FOOTBALL_LOGO_REGION_NAMES = new Intl.DisplayNames(["en"], { type: "region" });
for (const firstLetter of "abcdefghijklmnopqrstuvwxyz") {
    for (const secondLetter of "abcdefghijklmnopqrstuvwxyz") {
        const code = `${firstLetter}${secondLetter}`;
        const name = FOOTBALL_LOGO_REGION_NAMES.of(code.toUpperCase());
        if (!name || name.toLowerCase() === code) continue;
        const key = normalizeLogoLookupKey(name);
        const slug = FOOTBALL_LOGO_COUNTRY_ALIASES.get(key) || key.replace(/\s+/g, "-");
        if (FOOTBALL_LOGO_COUNTRIES.has(slug)) FOOTBALL_LOGO_COUNTRY_ALIASES.set(code, slug);
    }
}

const FOOTBALL_LOGO_TEAM_ALIASES = new Map([
    ["as far", { country: "morocco", file: "AS_FAR" }],
    ["far rabat", { country: "morocco", file: "AS_FAR" }],
    ["fus rabat", { country: "morocco", file: "Fath_Union_Sports_Rabat" }],
    ["maghreb fez", { country: "morocco", file: "Maghreb_of_Fez" }],
    ["mat tetouan", { country: "morocco", file: "Moghreb_Tetouan" }],
    ["moghreb tetouan", { country: "morocco", file: "Moghreb_Tetouan" }],
    ["raja casablanca", { country: "morocco", file: "Raja_Casablanca" }],
    ["raja club athletic", { country: "morocco", file: "Raja_Casablanca" }],
    ["difaa el jadidi", { country: "morocco", file: "Difaâ_Hassani_El_Jadidi" }],
    ["wydad casablanca", { country: "morocco", file: "Wydad_AC" }],
    ["wydad ac", { country: "morocco", file: "Wydad_AC" }],
    ["wydad athletic", { country: "morocco", file: "Wydad_AC" }]
]);
const FOOTBALL_LOGO_COMPETITION_ALIASES = [
    { country: "spain", file: "La_Liga", matches: [/^la liga$/, /^laliga$/, /^الدوري الاسباني$/] },
    { country: "germany", file: "Bundesliga", matches: [/bundesliga/, /الدوري الالماني/] },
    { country: "france", file: "Ligue_1", matches: [/ligue 1/, /الدوري الفرنسي/] },
    { country: "morocco", file: "Botola_Pro_2", matches: [/botola (?:pro )?2/, /البطولة المغربية 2/] },
    { country: "morocco", file: "Botola_Pro", matches: [/botola/, /البطولة المغربية/, /الدوري المغربي/] },
    { country: "algeria", file: "Ligue_1", matches: [/ligue 1/, /الدوري الجزائري/] },
    { country: "egypt", file: "Egyptian_Premier_League", matches: [/egyptian premier league/, /الدوري المصري/] },
    { country: "saudi-arabia", file: "Saudi_Professional_League", matches: [/saudi pro league/, /saudi professional/, /الدوري السعودي/] }
];
const FOOTBALL_LOGO_TOURNAMENT_ALIASES = new Map([
    ["afc champions league", "AFC_Champions_League_Elite"]
]);

function getLogoCountryValue(entity) {
    if (!entity || typeof entity !== "object") return "";
    const country = entity.repositoryCountry || entity.country || entity.teamCountry || entity.countryName || entity.originalCountry;
    if (country && typeof country === "object") {
        return country.originalName || country.name || country.countryName || country.code || "";
    }
    return entity.originalCountry || entity.countryName || country || entity.countryCode || "";
}

function getFootballLogoCountrySlug(entities, countryHint = "") {
    for (const value of [countryHint, ...entities.map(getLogoCountryValue)].filter(Boolean)) {
        const key = normalizeLogoLookupKey(value);
        const slug = FOOTBALL_LOGO_COUNTRY_ALIASES.get(key) || key.replace(/\s+/g, "-");
        if (FOOTBALL_LOGO_COUNTRIES.has(slug)) return slug;
    }
    return "";
}

function findFootballLogoFile(index, candidates) {
    if (!index) return null;
    for (const candidate of candidates) {
        const paths = index.get(candidate);
        if (paths?.size === 1) return paths.values().next().value;
    }
    return null;
}

function findFuzzyFootballTeamLogo(candidates, country) {
    const queryTokenSets = candidates
        .map(candidate => new Set(candidate.split(" ").filter(token => !FOOTBALL_LOGO_NAME_STOP_WORDS.has(token))))
        .filter(tokens => tokens.size >= 2);
    if (!queryTokenSets.length) return null;

    const candidateAssets = new Set();
    for (const tokens of queryTokenSets) {
        for (const token of tokens) {
            for (const asset of FOOTBALL_LOGO_TEAM_TOKEN_INDEX.get(token) || []) {
                if (!country || asset.country === country) candidateAssets.add(asset);
            }
        }
    }

    const matches = [];
    for (const asset of candidateAssets) {
        const score = Math.max(...queryTokenSets.map(queryTokens => {
            const sharedTokens = [...queryTokens].filter(token => asset.tokens.has(token)).length;
            return sharedTokens / Math.max(queryTokens.size, asset.tokens.size, 1);
        }));
        if (score >= 0.78) matches.push({ asset, score });
    }
    matches.sort((first, second) => second.score - first.score);
    if (matches.length && (!matches[1] || matches[0].score - matches[1].score >= 0.12)) {
        return matches[0].asset.logoUrl;
    }
    return null;
}

function getRepositoryTeamLogoUrl(entities) {
    const names = [];
    for (const entity of entities) {
        if (typeof entity === "string") names.push(entity);
        else if (entity && typeof entity === "object") {
            names.push(entity.originalName, entity.teamName, entity.clubName, entity.name);
        }
    }

    const country = getFootballLogoCountrySlug(entities);
    for (const name of names) {
        if (typeof name !== "string" || !name.trim()) continue;
        if (/national team|under[\s.-]*17|\bu[\s.-]*17\b|\bwomen\b|\bfemale\b/i.test(name)) continue;
        const alias = FOOTBALL_LOGO_TEAM_ALIASES.get(normalizeLogoLookupKey(name));
        const candidates = getFootballLogoNameKeys(alias?.file || name);
        const logoUrl = findFootballLogoFile(
            country || alias?.country
                ? FOOTBALL_LOGO_COUNTRY_FILES.get(alias?.country || country)
                : FOOTBALL_LOGO_GLOBAL_FILES,
            candidates
        );
        if (logoUrl) return logoUrl;
    }
    return findFuzzyFootballTeamLogo(
        names.flatMap(name => getFootballLogoNameKeys(name)),
        country
    );
}

function getRepositoryCompetitionLogoUrl(entities) {
    const country = getFootballLogoCountrySlug(entities);
    const names = entities.flatMap(entity => typeof entity === "string"
        ? [entity]
        : entity && typeof entity === "object"
            ? [entity.originalName, entity.leagueName, entity.name, entity.competitionName]
            : []);
    const nameKeys = [...new Set(names.flatMap(name => getFootballLogoNameKeys(name)))];
    for (const name of names) {
        const tournamentAlias = FOOTBALL_LOGO_TOURNAMENT_ALIASES.get(normalizeLogoLookupKey(name));
        if (tournamentAlias) {
            const logoUrl = findFootballLogoFile(FOOTBALL_LOGO_TOURNAMENT_FILES, getFootballLogoNameKeys(tournamentAlias));
            if (logoUrl) return logoUrl;
        }
    }

    const countryLogo = findFootballLogoFile(FOOTBALL_LOGO_COMPETITION_COUNTRY_FILES.get(country), nameKeys);
    if (countryLogo) return countryLogo;
    const tournamentLogo = findFootballLogoFile(FOOTBALL_LOGO_TOURNAMENT_FILES, nameKeys);
    if (tournamentLogo) return tournamentLogo;
    const globalLogo = findFootballLogoFile(FOOTBALL_LOGO_COMPETITION_GLOBAL_FILES, nameKeys);
    if (globalLogo) return globalLogo;

    for (const name of names) {
        const normalizedName = normalizeLogoLookupKey(name);
        const match = FOOTBALL_LOGO_COMPETITION_ALIASES.find(entry =>
            entry.country === country && entry.matches.some(pattern => pattern.test(normalizedName))
        );
        if (match) {
            return findFootballLogoFile(
                FOOTBALL_LOGO_COMPETITION_COUNTRY_FILES.get(country),
                getFootballLogoNameKeys(match.file)
            );
        }
    }

    const queryNames = names
        .filter(name => typeof name === "string")
        .map(name => normalizeLogoLookupKey(name).replace(/\b(?:fifa|uefa|caf|afc|conmebol|concacaf|ofc)\b|\b(?:19|20)\d{2}\b/g, " ").replace(/\s+/g, " ").trim())
        .filter(name => name.length >= 6);
    const matches = FOOTBALL_LOGO_COMPETITION_ASSETS
        .filter(asset => !country || !asset.country || asset.country === country)
        .map(asset => {
            const assetName = asset.name.replace(/\b(?:fifa|uefa|caf|afc|conmebol|concacaf|ofc)\b|\b(?:19|20)\d{2}\b/g, " ").replace(/\s+/g, " ").trim();
            const assetTokens = new Set(assetName.split(" ").filter(token => token.length > 1));
            const score = Math.max(0, ...queryNames.map(queryName => {
                const queryTokens = new Set(queryName.split(" ").filter(token => token.length > 1));
                const sharedTokens = [...queryTokens].filter(token => assetTokens.has(token)).length;
                return sharedTokens / Math.max(queryTokens.size, assetTokens.size, 1);
            }));
            return { asset, score };
        })
        .filter(candidate => candidate.score >= 0.72)
        .sort((first, second) => second.score - first.score);
    if (matches.length && (!matches[1] || matches[0].score - matches[1].score >= 0.12)) {
        return matches[0].asset.logoUrl;
    }
    return null;
}

function getFootballLogoUrl(type, ...entities) {
    const repositoryLogo = type === "team"
        ? getRepositoryTeamLogoUrl(entities)
        : getRepositoryCompetitionLogoUrl(entities);
    const goalApiLogo = entities
        .filter(entity => entity && typeof entity === "object")
        .flatMap(entity => [entity.logo, entity.badge, entity.crest, entity.emblem])
        .find(value => typeof value === "string" && /^https?:\/\//i.test(value.trim()));
    return repositoryLogo || goalApiLogo || "/site-logo.svg?v=2";
}

// =============================================
// STATIC FILES
// =============================================

app.use(
    express.static(
        __dirname
    )
);

app.get("/api/design-settings", (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
        const row = designSettingsDb.prepare("SELECT global_match_style, elements, backgrounds FROM design_settings WHERE id = 1").get();
        if (!row) {
            return res.json({
                success: true,
                exists: false,
                globalMatchStyle: { ...DEFAULT_GLOBAL_MATCH_STYLE },
                globalMatchStyles: {},
                standingsStyle: {},
                elements: {},
                backgrounds: {}
            });
        }
        const storedElements = JSON.parse(row.elements);
        const globalMatchStyles = storedElements.__globalMatchStyles || {};
        const lineupStyles = storedElements.__lineupStyles || {};
        const standingsStyle = storedElements.__standingsStyle || {};
        delete storedElements.__globalMatchStyles;
        delete storedElements.__lineupStyles;
        delete storedElements.__standingsStyle;
        return res.json({
            success: true,
            exists: true,
            globalMatchStyle: { ...DEFAULT_GLOBAL_MATCH_STYLE, ...JSON.parse(row.global_match_style) },
            globalMatchStyles,
            lineupStyles,
            standingsStyle,
            elements: storedElements,
            backgrounds: JSON.parse(row.backgrounds)
        });
    }
    catch (error) {
        console.error("تعذر تحميل إعدادات التصميم:", error);
        return res.status(500).json({ success: false, message: "تعذر تحميل إعدادات التصميم" });
    }
});

app.post("/api/design-settings", async (req, res) => {
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return res.status(400).json({ success: false, message: "إعدادات التصميم غير صالحة" });
    }

    try {
        const globalMatchStyles = body.globalMatchStyles && typeof body.globalMatchStyles === "object"
            ? body.globalMatchStyles
            : {};
        const lineupStyles = body.lineupStyles && typeof body.lineupStyles === "object"
            ? body.lineupStyles
            : {};
        const standingsStyle = body.standingsStyle && typeof body.standingsStyle === "object"
            ? body.standingsStyle
            : {};
        const elements = body.elements && typeof body.elements === "object" ? { ...body.elements } : {};
        elements.__globalMatchStyles = globalMatchStyles;
        elements.__lineupStyles = lineupStyles;
        elements.__standingsStyle = standingsStyle;
        const settings = {
            globalMatchStyle: { ...DEFAULT_GLOBAL_MATCH_STYLE, ...(body.globalMatchStyle || {}) },
            globalMatchStyles,
            lineupStyles,
            elements,
            backgrounds: body.backgrounds && typeof body.backgrounds === "object" ? body.backgrounds : {}
        };
        designSettingsDb.prepare(`
            INSERT INTO design_settings (id, global_match_style, elements, backgrounds)
            VALUES (1, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                global_match_style = excluded.global_match_style,
                elements = excluded.elements,
                backgrounds = excluded.backgrounds,
                updated_at = CURRENT_TIMESTAMP
        `).run(
            JSON.stringify(settings.globalMatchStyle),
            JSON.stringify(settings.elements),
            JSON.stringify(settings.backgrounds)
        );
        return res.json({ success: true, globalMatchStyle: settings.globalMatchStyle, globalMatchStyles: settings.globalMatchStyles, lineupStyles: settings.lineupStyles, standingsStyle });
    }
    catch (error) {
        console.error("تعذر حفظ إعدادات التصميم:", error);
        return res.status(500).json({ success: false, message: "تعذر حفظ إعدادات التصميم" });
    }
});

app.get("/match/:id", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});


// Proxy external team logos so previews and downloads are not blocked by CORS.
function sendFallbackLogo(res, cacheControl = "public, max-age=86400") {
        res.set("Cache-Control", cacheControl);
        return res.sendFile(FALLBACK_LOGO_PATH);
}

app.get("/api/logo", async (req, res) => {

    const logoUrl = req.query.url;

    if (!logoUrl || !/^https?:\/\//i.test(logoUrl)) {
        return sendFallbackLogo(res);
    }

    res.set("Access-Control-Allow-Origin", "*");
    res.set("Cross-Origin-Resource-Policy", "cross-origin");
    res.set("Timing-Allow-Origin", "*");

    try {
        const response = await fetch(logoUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0"
            }
        });

        const contentType = response.headers.get("content-type") || "";
        if (!response.ok || !contentType.toLowerCase().startsWith("image/")) {
            return sendFallbackLogo(res);
        }

        const bytes = Buffer.from(await response.arrayBuffer());

        res.set("Content-Type", contentType);
        res.set("Cache-Control", "public, max-age=604800, immutable");
        res.set("Content-Length", String(bytes.length));
        res.send(bytes);
    }
    catch (error) {
        sendFallbackLogo(res);
    }
});

// Return national flags as circular SVG images instead of rectangular files.
app.get("/api/national-logo/:code", async (req, res) => {
    const code = String(req.params.code || "").toLowerCase();

    if (!/^[a-z]{2}$/.test(code)) {
        return res.status(400).send("Invalid country code");
    }

    try {
        const response = await fetch(`${NATIONAL_FLAG_BASE_URL}/${code}.svg`, {
            headers: { "User-Agent": "Mozilla/5.0" }
        });

        if (!response.ok) {
            return sendFallbackLogo(res);
        }

        const contentType = response.headers.get("content-type") || "image/svg+xml";
        const bytes = Buffer.from(await response.arrayBuffer());
        res.set("Content-Type", contentType);
        res.set("Cache-Control", "public, max-age=604800, immutable");
        res.set("Content-Length", String(bytes.length));
        res.send(bytes);
    }
    catch (error) {
        sendFallbackLogo(res);
    }
});


// =============================================
// API KEY CHECK
// =============================================

if (!HAS_API_KEY) {

    console.log("");
    console.log("=================================");
    console.log("❌ GOAL_API_KEY غير موجود");
    console.log("ضع GOAL_API_KEY في ملف .env");
    console.log("=================================");
    console.log("");

}


// =============================================
// LOAD TRANSLATIONS
// =============================================

let translations = {

    teams: {},

    leagueIds: {},

    leagueCountry: {},

    leagues: {},

    countries: {}

};


try {

    const manualTranslations =
        require("./translations.ts");

    translations = {

        teams:
            {
                ...(manualTranslations.teamTranslations || {})
            },


        leagueIds:
            {
                ...(manualTranslations.leagueIdTranslations || {})
            },


        leagueCountry: {},


        leagues:
            {
                ...(manualTranslations.leagueTranslations || {})
            },

        teamLogoUrls: {
            ...(manualTranslations.teamLogoUrls || {})
        },

        leagueLogoUrls: {
            ...(manualTranslations.leagueLogoUrls || {})
        },


        countries: {}

    };


    console.log(
        "✅ translations.js تم تحميله بنجاح"
    );


    console.log(
        "⚽ عدد الفرق:",
        Object.keys(
            translations.teams
        ).length
    );


    console.log(
        "🏆 عدد البطولات حسب ID:",
        Object.keys(
            translations.leagueIds
        ).length
    );


    console.log(
        "🌍 عدد البطولات حسب الدولة:",
        Object.keys(
            translations.leagueCountry
        ).length
    );


}
catch (error) {

    console.error("");

    console.error(
        "❌ خطأ في تحميل translations.js"
    );

    console.error(
        error.message
    );

    console.error("");

}


// =============================================
// NORMALIZE TEXT
// تنظيف النص قبل المقارنة
// =============================================

function normalizeName(name) {

    if (!name) {

        return "";

    }


    return String(name)

        .trim()

        .toLowerCase()

        .normalize("NFD")

        .replace(/\p{M}/gu, "")

        .replace(/\s+/g, " ")

        .replace(/[’'`]/g, "")

        .replace(/-/g, " ");

}


// =============================================
// FIND TRANSLATION
// =============================================

function findTranslation(
    object,
    name
) {

    if (
        !object ||
        !name
    ) {

        return null;

    }


    // =========================================
    // DIRECT SEARCH
    // =========================================

    if (
        object[name]
    ) {

        return object[name];

    }


    // =========================================
    // NORMALIZED SEARCH
    // =========================================

    const normalizedName =
        normalizeName(name);


    for (
        const key of Object.keys(object)
    ) {

        if (
            normalizeName(key)
            ===
            normalizedName
        ) {

            return object[key];

        }

    }


    return null;

}

// =============================================
// NATIONAL TEAM FLAGS
//
// لعرض شعار المنتخبات الوطنية كعلم دائري بسيط
// (بدون شعار الاتحاد، بدون نجوم، بدون أي رموز إضافية)
// المصدر: https://hatscripts.github.io/circle-flags

// =============================================

const NATIONAL_FLAG_BASE_URL =
    "https://hatscripts.github.io/circle-flags/flags";

// خريطة: اسم المنتخب (كما يرد من مزود البيانات، بالإنجليزية غالباً) => كود الدولة (ISO 3166-1 alpha-2)
// تشمل أهم الأسماء البديلة (Aliases) الشائعة عند مزودي بيانات كرة القدم
const NATIONAL_TEAM_COUNTRY_CODES = {

    // ===================== أفريقيا =====================
    "Morocco": "ma",
    "Algeria": "dz",
    "Tunisia": "tn",
    "Libya": "ly",
    "Egypt": "eg",
    "Sudan": "sd",
    "South Sudan": "ss",
    "Mauritania": "mr",
    "Senegal": "sn",
    "Gambia": "gm",
    "Guinea-Bissau": "gw",
    "Guinea": "gn",
    "Sierra Leone": "sl",
    "Liberia": "lr",
    "Ivory Coast": "ci",
    "Côte d'Ivoire": "ci",
    "Cote d'Ivoire": "ci",
    "Ghana": "gh",
    "Togo": "tg",
    "Benin": "bj",
    "Nigeria": "ng",
    "Niger": "ne",
    "Burkina Faso": "bf",
    "Mali": "ml",
    "Cape Verde": "cv",
    "Cape Verde Islands": "cv",
    "Cabo Verde": "cv",
    "Cameroon": "cm",
    "Chad": "td",
    "Central African ": "cf",
    "Equatorial Guinea": "gq",
    "Gabon": "ga",
    "Congo": "cg",
    "D.R.Congo": "cd",
    "Congo DR": "cd",
    "Democratic Republic of Congo": "cd",
    "DRC": "cd",
    "Angola": "ao",
    "Zambia": "zm",
    "Malawi": "mw",
    "Mozambique": "mz",
    "Zimbabwe": "zw",
    "Namibia": "na",
    "Botswana": "bw",
    "South Africa": "za",
    "Lesotho": "ls",
    "Eswatini": "sz",
    "Swaziland": "sz",
    "Tanzania": "tz",
    "Kenya": "ke",
    "Uganda": "ug",
    "Rwanda": "rw",
    "Burundi": "bi",
    "Ethiopia": "et",
    "Eritrea": "er",
    "Djibouti": "dj",
    "Somalia": "so",
    "Comoros": "km",
    "Madagascar": "mg",
    "Mauritius": "mu",
    "Seychelles": "sc",

    // ===================== أوروبا =====================
    "England": "gb-eng",
    "Scotland": "gb-sct",
    "Wales": "gb-wls",
    "Northern Ireland": "gb-nir",
    "Republic of Ireland": "ie",
    "Ireland": "ie",
    "France": "fr",
    "Spain": "es",
    "Portugal": "pt",
    "Germany": "de",
    "Italy": "it",
    "Netherlands": "nl",
    "Belgium": "be",
    "Switzerland": "ch",
    "Austria": "at",
    "Denmark": "dk",
    "Sweden": "se",
    "Norway": "no",
    "Finland": "fi",
    "Iceland": "is",
    "Poland": "pl",
    "Czech Republic": "cz",
    "Czechia": "cz",
    "Slovakia": "sk",
    "Hungary": "hu",
    "Romania": "ro",
    "Bulgaria": "bg",
    "Greece": "gr",
    "Turkey": "tr",
    "Cyprus": "cy",
    "Croatia": "hr",
    "Serbia": "rs",
    "Bosnia and Herzegovina": "ba",
    "Bosnia-Herzegovina": "ba",
    "Bosnia": "ba",
    "Montenegro": "me",
    "North Macedonia": "mk",
    "Macedonia FYR": "mk",
    "FYR Macedonia": "mk",
    "Albania": "al",
    "Kosovo": "xk",
    "Slovenia": "si",
    "Ukraine": "ua",
    "Belarus": "by",
    "Moldova": "md",
    "Russia": "ru",
    "Estonia": "ee",
    "Latvia": "lv",
    "Lithuania": "lt",
    "Georgia": "ge",
    "Armenia": "am",
    "Azerbaijan": "az",
    "Luxembourg": "lu",
    "Malta": "mt",
    "Andorra": "ad",
    "San Marino": "sm",
    "Gibraltar": "gi",
    "Faroe Islands": "fo",
    "Israel": "il",
    "Kazakhstan": "kz",

    // ===================== آسيا =====================
    "Saudi Arabia": "sa",
    "United Arab Emirates": "ae",
    "UAE": "ae",
    "Qatar": "qa",
    "Bahrain": "bh",
    "Kuwait": "kw",
    "Oman": "om",
    "Yemen": "ye",
    "Jordan": "jo",
    "Lebanon": "lb",
    "Syria": "sy",
    "Iraq": "iq",
    "Iran": "ir",
    "IR Iran": "ir",
    "Palestine": "ps",
    "Japan": "jp",
    "South Korea": "kr",
    "Korea Republic": "kr",
    "North Korea": "kp",
    "Korea DPR": "kp",
    "China": "cn",
    "China PR": "cn",
    "Chinese Taipei": "tw",
    "Taiwan": "tw",
    "Hong Kong": "hk",
    "Mongolia": "mn",
    "India": "in",
    "Pakistan": "pk",
    "Bangladesh": "bd",
    "Sri Lanka": "lk",
    "Nepal": "np",
    "Bhutan": "bt",
    "Maldives": "mv",
    "Afghanistan": "af",
    "Uzbekistan": "uz",
    "Turkmenistan": "tm",
    "Tajikistan": "tj",
    "Kyrgyzstan": "kg",
    "Thailand": "th",
    "Vietnam": "vn",
    "Malaysia": "my",
    "Singapore": "sg",
    "Indonesia": "id",
    "Philippines": "ph",
    "Myanmar": "mm",
    "Cambodia": "kh",
    "Laos": "la",
    "Brunei": "bn",
    "Timor-Leste": "tl",

    // ===================== أمريكا الشمالية والوسطى والكاريبي =====================
    "USA": "us",
    "United States": "us",
    "United States of America": "us",
    "Canada": "ca",
    "Mexico": "mx",
    "Costa Rica": "cr",
    "Panama": "pa",
    "Honduras": "hn",
    "Guatemala": "gt",
    "El Salvador": "sv",
    "Nicaragua": "ni",
    "Belize": "bz",
    "Jamaica": "jm",
    "Haiti": "ht",
    "Cuba": "cu",
    "Dominican Republic": "do",
    "Trinidad and Tobago": "tt",
    "Trinidad & Tobago": "tt",
    "Bahamas": "bs",
    "Barbados": "bb",
    "Grenada": "gd",
    "Antigua and Barbuda": "ag",
    "St Kitts and Nevis": "kn",
    "Saint Kitts and Nevis": "kn",
    "St Lucia": "lc",
    "Saint Lucia": "lc",
    "St Vincent and the Grenadines": "vc",
    "Saint Vincent and the Grenadines": "vc",
    "Guyana": "gy",
    "Suriname": "sr",
    "Puerto Rico": "pr",
    "Bermuda": "bm",

    // ===================== أمريكا الجنوبية =====================
    "Brazil": "br",
    "Argentina": "ar",
    "Uruguay": "uy",
    "Chile": "cl",
    "Colombia": "co",
    "Peru": "pe",
    "Ecuador": "ec",
    "Bolivia": "bo",
    "Paraguay": "py",
    "Venezuela": "ve",

    // ===================== أوقيانوسيا =====================
    "Australia": "au",
    "New Zealand": "nz",
    "Fiji": "fj",
    "Papua New Guinea": "pg",
    "Solomon Islands": "sb",
    "Vanuatu": "vu",
    "New Caledonia": "nc",
    "Tahiti": "pf",
    "Samoa": "ws",
    "Tonga": "to"

};

function normalizeCountryCode(value) {
    if (!value || typeof value !== "object") return null;

    const candidates = [
        value.countryCode,
        value.country_code,
        value.iso2,
        value.isoCode,
        value.country?.code,
        value.country?.countryCode,
        value.country?.iso2,
        value.nationality?.code,
        value.nationality?.iso2
    ];
    const code = candidates.find(candidate => /^[a-z]{2}(?:-[a-z]{3})?$/i.test(String(candidate || "").trim()));
    return code ? String(code).trim().toLowerCase() : null;
}

function getNationalTeamFlagLogo(teamOrName) {
    const team = teamOrName && typeof teamOrName === "object" ? teamOrName : {};
    const name = typeof teamOrName === "string"
        ? teamOrName
        : team.name || team.teamName || team.originalName || "";
    const code = normalizeCountryCode(team)
        || normalizeCountryCode(team.country)
        || [
            team.country?.name,
            team.countryName,
            team.nationality?.name,
            name,
            nationalTeamLogoLookupKey(name)
        ]
            .map(candidate => findTranslation(NATIONAL_TEAM_COUNTRY_CODES, candidate))
            .find(Boolean);

    return code ? `${NATIONAL_FLAG_BASE_URL}/${code}.svg` : null;
}

function isNationalTeamFixture(event, homeFlag, awayFlag) {
    if (homeFlag || awayFlag) return true;

    const typeValues = [
        event.homeTeamType,
        event.awayTeamType,
        event.homeTeam?.type,
        event.awayTeam?.type,
        event.homeTeam?.teamType,
        event.awayTeam?.teamType,
        event.competition?.type,
        event.league?.type,
        event.tournament?.type
    ].filter(value => typeof value === "string");
    if (typeValues.some(value => /national|international|country/i.test(value))) return true;

    const competitionNames = [
        event.leagueName,
        event.competitionName,
        event.league?.name,
        event.competition?.name,
        event.tournament?.name
    ].filter(Boolean).join(" ");
    return /fifa|world cup|world championship|nations league|national team|qualif|كأس العالم|منتخبات/i.test(competitionNames);
}

function applyGoalApiLogosToRawFixture(event) {

    if (!event || typeof event !== "object") {
        return event;
    }

    const homeTeamObj = event.homeTeam || event.home_team || event.home || event.teams?.home || {};
    const awayTeamObj = event.awayTeam || event.away_team || event.away || event.teams?.away || {};

    const homeName =
        event.homeTeamName
        || homeTeamObj.name
        || event.teams?.home?.name
        || event.homeName
        || "";

    const awayName =
        event.awayTeamName
        || awayTeamObj.name
        || event.teams?.away?.name
        || event.awayName
        || "";

    const league = event.league || event.competition || event.tournament || {};
    const homeFlag = getNationalTeamFlagLogo(homeTeamObj) || getNationalTeamFlagLogo(homeName);
    const awayFlag = getNationalTeamFlagLogo(awayTeamObj) || getNationalTeamFlagLogo(awayName);
    const isNationalFixture = isNationalTeamFixture(event, homeFlag, awayFlag);
    const homeLogo = isNationalFixture
        ? homeFlag || "/site-logo.svg?v=2"
        : getFootballLogoUrl("team",
        homeTeamObj,
        event.home,
        event.teams?.home,
        { badge: event.teamHomeBadge, logo: event.homeTeamLogo },
        homeName
    );
    const awayLogo = isNationalFixture
        ? awayFlag || "/site-logo.svg?v=2"
        : getFootballLogoUrl("team",
        awayTeamObj,
        event.away,
        event.teams?.away,
        { badge: event.teamAwayBadge, logo: event.awayTeamLogo },
        awayName
    );
    event.homeTeam = { ...homeTeamObj, badge: homeLogo, logo: homeLogo, crest: homeLogo };
    event.home = { ...(event.home || {}), badge: homeLogo, logo: homeLogo, crest: homeLogo };
    event.teams = {
        ...(event.teams || {}),
        home: { ...(event.teams?.home || {}), ...homeTeamObj, badge: homeLogo, logo: homeLogo, crest: homeLogo },
        away: { ...(event.teams?.away || {}), ...awayTeamObj, badge: awayLogo, logo: awayLogo, crest: awayLogo }
    };
    event.teamHomeBadge = homeLogo;
    event.homeTeamLogo = homeLogo;

    event.awayTeam = { ...awayTeamObj, badge: awayLogo, logo: awayLogo, crest: awayLogo };
    event.away = { ...(event.away || {}), badge: awayLogo, logo: awayLogo, crest: awayLogo };
    event.teamAwayBadge = awayLogo;
    event.awayTeamLogo = awayLogo;

    const leagueId = event.leagueId || league.id || league.leagueId || league.competitionId;
    const leagueName = event.leagueName || league.name || league.leagueName;
    const leagueCountry = event.countryName || league.country?.name || league.country;
    if (leagueId || leagueName) {
        const leagueLogo = getFootballLogoUrl("league",
            {
                ...(typeof league === "object" ? league : {}),
                name: leagueName || league.name,
                country: leagueCountry
            },
            event.competition,
            event.tournament,
            { logo: event.leagueLogo },
            leagueName
        );
        event.leagueLogo = leagueLogo;
        if (event.league && typeof event.league === "object") {
            event.league = { ...event.league, logo: leagueLogo };
        }
        if (event.competition && typeof event.competition === "object") {
            event.competition = { ...event.competition, logo: leagueLogo };
        }
        if (event.tournament && typeof event.tournament === "object") {
            event.tournament = { ...event.tournament, logo: leagueLogo };
        }
    }

    return event;

}


// =============================================
// TRANSLATE TEAM
// =============================================

function translateTeam(name) {

    if (name && typeof name === "object") {
        name = [name.originalName, name.teamName, name.clubName, name.name]
            .find(value => typeof value === "string" && value.trim()) || "";
    }

    if (!name) {
        return name;
    }

    const translated = findTranslation(translations.teams, name);
    if (translated) {
        return translated;
    }

    if (typeof name === "string" && /\b(?:u[\s.-]*17|under[\s.-]*17|women(?:['’]s)?|female|girls?|national team)\b/i.test(name)) {
        const countryName = name
            .replace(/\b(?:under[\s.-]*17|u[\s.-]*17)\b|\b(?:women(?:['’]s)?|female|girls?|national|team|w)\b/gi, " ")
            .replace(/\s+/g, " ")
            .trim();
        const nationalTeamTranslation = findTranslation(translations.teams, countryName);
        if (nationalTeamTranslation) {
            return nationalTeamTranslation;
        }
    }

    if (!translated) {
        console.warn(`ترجمة الفريق غير موجودة، سيتم عرض الاسم الأصلي: ${name}`);
    }

    return name;

}

function translateHeadToHeadNames(payload) {
    if (!payload) return payload;

    const translateMatch = match => {
        if (!match || typeof match !== 'object') return match;
        const translated = { ...match };
        ['match_hometeam_name', 'match_awayteam_name', 'homeTeamName', 'awayTeamName'].forEach(field => {
            if (translated[field]) translated[field] = translateTeam(translated[field]);
        });
        if (translated.homeTeam?.name) translated.homeTeam = { ...translated.homeTeam, name: translateTeam(translated.homeTeam.name) };
        if (translated.awayTeam?.name) translated.awayTeam = { ...translated.awayTeam, name: translateTeam(translated.awayTeam.name) };
        if (translated.home?.name) translated.home = { ...translated.home, name: translateTeam(translated.home.name) };
        if (translated.away?.name) translated.away = { ...translated.away, name: translateTeam(translated.away.name) };
        return translated;
    };

    const result = Array.isArray(payload) ? payload.map(translateMatch) : { ...payload };
    if (Array.isArray(result)) return result;
    if (Array.isArray(result.matches)) result.matches = result.matches.map(translateMatch);
    if (Array.isArray(result.fixtures)) result.fixtures = result.fixtures.map(translateMatch);
    if (result.team1?.name) result.team1 = { ...result.team1, name: translateTeam(result.team1.name) };
    if (result.team2?.name) result.team2 = { ...result.team2, name: translateTeam(result.team2.name) };
    return result;
}

function translateTeamFixtureNames(items) {
    if (!Array.isArray(items)) return [];

    return items.map(item => {
        if (!item || typeof item !== 'object') return item;
        const result = { ...item };
        const translateObject = value => value && typeof value === 'object'
            ? { ...value, name: value.name ? translateTeam(value.name) : value.name }
            : value;

        result.homeTeam = translateObject(result.homeTeam);
        result.awayTeam = translateObject(result.awayTeam);
        result.home = translateObject(result.home);
        result.away = translateObject(result.away);
        result.teams = result.teams ? {
            ...result.teams,
            home: translateObject(result.teams.home),
            away: translateObject(result.teams.away)
        } : result.teams;

        ['homeTeamName', 'awayTeamName', 'homeName', 'awayName', 'match_hometeam_name', 'match_awayteam_name'].forEach(field => {
            if (result[field]) result[field] = translateTeam(result[field]);
        });
        return result;
    });
}


function translateFixtureNames(result) {

    if (!result || !Array.isArray(result.leagues)) {
        return result;
    }


    result.leagues.forEach(league => {

        league.leagueName = translateLeague(
            league.leagueId,
            league.leagueOriginalName || league.leagueName,
            league.countryOriginal || league.country
        );


        league.matches = Array.isArray(league.matches)
            ? league.matches.map(match => {
                const homeName = match.home?.originalName || match.home?.name;
                const awayName = match.away?.originalName || match.away?.name;
                const translatedHome = translateTeam(homeName);
                const translatedAway = translateTeam(awayName);

                return {
                    ...match,
                    home: { ...match.home, name: translatedHome },
                    away: { ...match.away, name: translatedAway },
                    homeTeam: { ...match.homeTeam, name: translatedHome },
                    awayTeam: { ...match.awayTeam, name: translatedAway }
                };
            })
            : [];
    });


    return result;

}


// =============================================
// TRANSLATE COUNTRY
// =============================================

function translateCountry(name) {

    if (!name) {

        return name;

    }


    const translated =
        findTranslation(
            translations.countries,
            name
        );

    if (translated) return translated;

    const countryTranslations = {
        international: 'دولي',
        intl: 'دولي',
        world: 'العالم',
        england: 'إنجلترا',
        spain: 'إسبانيا',
        france: 'فرنسا',
        germany: 'ألمانيا',
        italy: 'إيطاليا',
        portugal: 'البرتغال',
        netherlands: 'هولندا',
        belgium: 'بلجيكا',
        turkey: 'تركيا',
        greece: 'اليونان',
        egypt: 'مصر',
        algeria: 'الجزائر',
        morocco: 'المغرب',
        tunisia: 'تونس',
        saudi: 'السعودية',
        'saudi arabia': 'السعودية',
        qatar: 'قطر',
        uae: 'الإمارات',
        'united arab emirates': 'الإمارات',
        europe: 'أوروبا',
        africa: 'إفريقيا',
        brazil: 'البرازيل',
        argentina: 'الأرجنتين',
        usa: 'الولايات المتحدة',
        'united states': 'الولايات المتحدة',
        mexico: 'المكسيك',
        japan: 'اليابان',
        korea: 'كوريا الجنوبية',
        australia: 'أستراليا'
    };

    return countryTranslations[normalizeName(name)] || name;

}


// =============================================
// TRANSLATE LEAGUE
//
// الأولوية:
//
// 1️⃣ League ID
// 2️⃣ Country + League Name
// 3️⃣ League Name
// 4️⃣ Original Name
//
// =============================================

function translateLeague(
    leagueId,
    leagueName,
    country
) {
    const normalizedLeagueId = leagueId === null || leagueId === undefined
        ? ""
        : String(leagueId).trim();

    if (normalizedLeagueId && translations.leagueIds?.[normalizedLeagueId]) {
        return translations.leagueIds[normalizedLeagueId];
    }

    if (!leagueName) {
        return leagueName;
    }

    const normalizedLeague = normalizeName(leagueName);
    const normalizedCountry = normalizeName(country);

    if (normalizedLeague === 'premier league' && normalizedCountry !== 'england') {
        return leagueName;
    }

    const countryKey = `${normalizedCountry}:${normalizedLeague}`;
    if (translations.leagueCountry?.[countryKey]) {
        return translations.leagueCountry[countryKey];
    }

    const translated = findTranslation(translations.leagues, leagueName);
    if (translated) {
        return translated;
    }

    return leagueName;

}


// =============================================
// MATCH STATUS
// =============================================

function normalizeScore(score) {

    if (score == null) {
        return null;
    }

    if (typeof score === "object") {
        score =
            score.current ??
            score.fullTime ??
            score.fulltime ??
            score.final ??
            score.ft ??
            score.value ??
            score.goals ??
            score.score;
    }

    const normalized = Number(score);

    return Number.isFinite(normalized)
        ? normalized
        : null;

}

function getMatchStatus(status) {

    const short =
        typeof status === "string"
            ? status
            : status?.short || status?.type;

    const normalizedShort =
        String(short || "")
            .trim()
            .toUpperCase()
            .replace(/[ -]/g, "_");


    // =========================================
    // LIVE
    // =========================================

    const liveStatuses = [

        "1H",

        "HT",

        "2H",

        "ET",

        "BT",

        "P",

        "INT",

        "LIVE",

        "IN_PLAY",

    ];


    if (
        liveStatuses.includes(normalizedShort) ||
        ["INPROGRESS", "IN_PROGRESS", "IN_PLAY", "INPLAY"].includes(normalizedShort)
    ) {

        return "live";

    }


    // =========================================
    // FINISHED
    // =========================================

    const finishedStatuses = [

        "FT",

        "AET",

        "PEN",

        "AWARDED"

    ];


    if (
        finishedStatuses.includes(normalizedShort) ||
        ["FINISHED", "COMPLETED", "COMPLETE", "ENDED", "END"].includes(normalizedShort)
    ) {

        return "finished";

    }

    // =========================================
    // POSTPONED
    // =========================================

    const postponedStatuses = [

        "PST",

        "CANC",

        "ABD",

        "AWD",

        "WO",

        "SUSPENDED",

        "CANCELLED"

    ];


    if (
        postponedStatuses.includes(normalizedShort)
    ) {

        return "postponed";

    }


    return "scheduled";

}


// =============================================
// CACHE
// لتقليل استهلاك API
// =============================================

const cache =
    new Map();


// Keep live fixture results fresh while avoiding duplicate upstream requests.

const CACHE_TIME =
    20 * 1000;

const TARGET_FIXTURES_CACHE_TIME =
    5 * 60 * 1000;

const leagueCatalogCache = {
    time: 0,
    data: []
};

const targetFixturesCache = new Map();

const allLeaguesCache = {
    time: 0,
    data: []
};

const allCountriesCache = {
    time: 0,
    data: []
};

const TOP_SCORERS_SEASON = "2026/2027";
const standingsCache = new Map();
const topScorersCache = new Map();

const STANDINGS_CACHE_TIME = 45 * 1000;
const TOP_SCORERS_CACHE_TIME = 10 * 60 * 1000;

const TARGET_LEAGUES = [
    { name: "Premier League", country: "England" },
    { name: "La Liga", country: "Spain" },
    { name: "Serie A", country: "Italy" },
    { name: "Bundesliga", country: "Germany" },
    { name: "Ligue 1", country: "France" },
    { name: "Eredivisie", country: "Netherlands" },
    { name: "Primeira Liga", country: "Portugal" },
    { name: "First Division A", country: "Belgium" },
    { name: "Süper Lig", country: "Turkey" },
    { name: "Super League 1", country: "Greece" },
    { name: "UEFA Champions League", country: "Europe" },
    { name: "UEFA Europa League", country: "Europe" },
    { name: "UEFA Conference League", country: "Europe" },
    { name: "CAF Champions League", country: "intl" },
    { name: "CAF Confederation Cup", country: "intl" }
];

// =============================================
// PAGINATION HELPERS
//
// GoalAPI قد لا يرجع دائماً نفس شكل حقل "pagination"
// (hasMore / has_more / next / total ...). سابقاً كان
// الكود يعتمد فقط على pagination.hasMore، وإذا كان هذا
// الحقل غير موجود في رد الـ API فإن الحلقة كانت تتوقف من
// أول صفحة (100 عنصر كحد أقصى) وهذا هو سبب اختفاء بعض
// المباريات (خصوصاً الأيام المزدحمة مثل أكتوبر).
//
// الحل: نتحقق من عدة أشكال محتملة لحقل hasMore، وإذا لم
// نجد أي واحد منها نفترض أنه قد توجد صفحة أخرى طالما أن
// الصفحة الحالية رجعت "ممتلئة" (طولها == limit المطلوب).
// كما نضيف حداً أقصى لعدد الصفحات كحماية من infinite loop.
// =============================================

const MAX_PAGINATION_PAGES = 100; // حماية: 100 صفحة * 100 عنصر = 10000 عنصر كحد أقصى لكل طلب

function paginationSaysHasMore(pagination, pageLength, limit) {

    if (!pageLength) {
        return false;
    }

    if (!pagination || typeof pagination !== "object") {
        // لا توجد معلومات pagination في الرد: افترض وجود صفحة
        // أخرى إذا رجعت الصفحة الحالية ممتلئة بالكامل
        return pageLength >= limit;
    }

    if (typeof pagination.hasMore === "boolean") {
        return pagination.hasMore;
    }

    if (typeof pagination.hasMore === "string") {
        return pagination.hasMore.toLowerCase() === "true";
    }

    if (typeof pagination.has_more === "boolean") {
        return pagination.has_more;
    }

    if (typeof pagination.has_next === "boolean") {
        return pagination.has_next;
    }

    if (typeof pagination.hasNext === "boolean") {
        return pagination.hasNext;
    }

    if (pagination.next || pagination.nextOffset != null || pagination.next_offset != null || pagination.nextPage != null || pagination.next_page != null) {
        return true;
    }

    if (pagination.total != null) {
        const total = Number(pagination.total);
        const offset = Number(pagination.offset ?? 0);
        const returnedLimit = Number(pagination.limit ?? limit ?? pageLength);

        if (Number.isFinite(total) && Number.isFinite(offset) && Number.isFinite(returnedLimit)) {
            return offset + returnedLimit < total;
        }
    }

    if (pagination.totalPages != null && pagination.page != null) {
        return Number(pagination.page) < Number(pagination.totalPages);
    }

    // لا توجد أي إشارة صريحة: افترض احتمال وجود صفحة أخرى
    // طالما أن الصفحة الحالية رجعت ممتلئة بالكامل
    return pageLength >= limit;

}

function nextPaginationOffset(pagination, currentOffset, pageLength, limit) {

    const rawOffset = Number(pagination?.offset ?? currentOffset);
    const rawLimit = Number(pagination?.limit ?? limit ?? pageLength);
    const candidate = (Number.isFinite(rawOffset) ? rawOffset : currentOffset)
        + (Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : pageLength);

    // تأكد أن offset يتقدم فعلاً لتفادي أي حلقة لا نهائية
    return candidate > currentOffset ? candidate : currentOffset + pageLength;

}

function buildFixtureDedupeKey(event) {

    return event?.id
        || event?.apiId
        || event?.fixtureId
        || `${event?.homeTeamId || ""}:${event?.awayTeamId || ""}:${event?.kickoffUtc || event?.matchDate || event?.date || ""}`;

}

async function goalApiJson(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response;

    try {
        response = await fetch(url, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${GOAL_API_KEY}`,
                Accept: "application/json"
            },
            signal: controller.signal
        });
    }
    catch (error) {
        if (error.name === "AbortError") {
            throw new Error("انتهت مهلة الاتصال بمصدر المباريات");
        }
        throw error;
    }
    finally {
        clearTimeout(timeout);
    }

    const data = await response.json();

    if (!response.ok) {
        const error = new Error(
            `GOAL API returned ${response.status}`
        );
        error.status = response.status;
        throw error;
    }

    return data;
}

async function fetchAllGoalApiPages(urlForOffset, selectPage, limit) {
    const firstData = await goalApiJson(urlForOffset(0));
    const firstPage = selectPage(firstData);
    if (!firstPage.length) return [];

    const items = [...firstPage];
    let pageCount = 1;
    let pagination = firstData?.pagination || {};
    let currentPageLength = firstPage.length;
    let offset = nextPaginationOffset(pagination, 0, firstPage.length, limit);
    const total = Number(pagination.total);
    const pageSize = Number(pagination.limit) || limit;

    if (Number.isFinite(total) && total > offset && pageSize > 0) {
        while (offset < total && pageCount < MAX_PAGINATION_PAGES) {
            const offsets = [];
            while (offsets.length < 3 && offset < total && pageCount + offsets.length < MAX_PAGINATION_PAGES) {
                offsets.push(offset);
                offset += pageSize;
            }

            const pages = await Promise.all(offsets.map(pageOffset =>
                goalApiJson(urlForOffset(pageOffset))
            ));
            pageCount += pages.length;

            for (const data of pages) {
                const page = selectPage(data);
                if (!page.length) return items;
                items.push(...page);
            }
        }
        return items;
    }

    while (
        paginationSaysHasMore(pagination, currentPageLength, limit) &&
        pageCount < MAX_PAGINATION_PAGES
    ) {
        const data = await goalApiJson(urlForOffset(offset));
        const page = selectPage(data);
        pageCount++;
        if (!page.length) break;
        items.push(...page);
        currentPageLength = page.length;
        pagination = data?.pagination || {};
        offset = nextPaginationOffset(pagination, offset, page.length, limit);
    }

    return items;
}

function getFixtureTypeMeta(event = {}) {
    const values = [
        event.homeTeamType,
        event.awayTeamType,
        event.homeTeam?.type,
        event.awayTeam?.type,
        event.homeTeam?.teamType,
        event.awayTeam?.teamType,
        event.competition?.type,
        event.league?.type,
        event.tournament?.type
    ].filter(value => typeof value === "string" && value.trim().length > 0);

    if (!values.length) {
        return { club: false, national: false };
    }

    const normalized = values.join(" ").toLowerCase();
    return {
        club: /club|team/.test(normalized),
        national: /national|country|international|fifa|qualifier|qualifying|nations|world cup|africa cup|copa america|euro|european|confederations|olympic|cup/.test(normalized)
    };
}

// =============================================
// FETCH ALL FIXTURES FOR A GIVEN DATE
// يجلب كل الصفحات المتوفرة من GoalAPI بدون الاعتماد
// حصرياً على pagination.hasMore، ويحذف أي تكرار.
// =============================================

async function fetchAllDateFixtures(date) {
    const allEvents = [];
    const seen = new Set();
    const pageLimit = 100;
    const maxConcurrentPages = 3;
    let offset = 0;
    let pageCount = 0;

    const getPageEvents = data => Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.fixtures)
            ? data.fixtures
            : Array.isArray(data)
                ? data
                : [];

    const addPageEvents = page => {
        for (const event of page) {
            const key = buildFixtureDedupeKey(event);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            allEvents.push(event);
        }
    };

    while (pageCount < MAX_PAGINATION_PAGES) {

        pageCount++;

        let data;

        try {
            data = await goalApiJson(
                `${API_URL}/fixtures?from=${encodeURIComponent(date)}&to=${encodeURIComponent(date)}&limit=${pageLimit}&offset=${offset}`
            );
        }
        catch (error) {
            if (error.status === 429) {
                console.error(
                    `تم إيقاف pagination لتاريخ ${date} بسبب rate limit (429) بعد ${pageCount - 1} صفحة`
                );
                break;
            }
            throw error;
        }

        const page = getPageEvents(data);

        if (!page.length) {
            break;
        }

        addPageEvents(page);

        const pagination = data?.pagination || {};
        const hasMore = paginationSaysHasMore(pagination, page.length, pageLimit);

        if (!hasMore) {
            break;
        }

        offset = nextPaginationOffset(pagination, offset, page.length, pageLimit);

        const total = Number(pagination.total);
        const batchPageSize = Number(pagination.limit) || pageLimit;
        if (Number.isFinite(total) && total > offset && batchPageSize > 0) {
            let stopFetching = false;
            while (offset < total && pageCount < MAX_PAGINATION_PAGES && !stopFetching) {
                const offsets = [];
                while (
                    offsets.length < maxConcurrentPages &&
                    offset < total &&
                    pageCount + offsets.length < MAX_PAGINATION_PAGES
                ) {
                    offsets.push(offset);
                    offset += batchPageSize;
                }

                const results = await Promise.all(offsets.map(async pageOffset => {
                    try {
                        return { data: await goalApiJson(
                            `${API_URL}/fixtures?from=${encodeURIComponent(date)}&to=${encodeURIComponent(date)}&limit=${pageLimit}&offset=${pageOffset}`
                        ) };
                    }
                    catch (error) {
                        return { error };
                    }
                }));
                pageCount += offsets.length;

                for (const result of results) {
                    if (result.error) {
                        if (result.error.status === 429) {
                            console.error(
                                `تم إيقاف pagination لتاريخ ${date} بسبب rate limit (429) بعد ${pageCount - 1} صفحة`
                            );
                            stopFetching = true;
                            break;
                        }
                        throw result.error;
                    }

                    const batchPage = getPageEvents(result.data);
                    if (!batchPage.length) {
                        stopFetching = true;
                        break;
                    }
                    addPageEvents(batchPage);
                }
            }
            break;
        }

        if (pagination.total != null && offset >= Number(pagination.total)) {
            break;
        }
    }

    if (pageCount >= MAX_PAGINATION_PAGES) {
        console.warn(
            `⚠️ تم بلوغ الحد الأقصى لعدد صفحات pagination (${MAX_PAGINATION_PAGES}) لتاريخ ${date}، قد تكون هناك مباريات إضافية لم يتم جلبها`
        );
    }

    console.log(`[GOAL API] pagination pages fetched for ${date}: ${pageCount}`);

    return allEvents;
}

// مطابقة مرنة لكأس أمم أفريقيا (الاسم الرسمي عند مزودي البيانات يختلف
// حسب الموسم: قد يكون مربوطاً بدولة "World" أو "Africa" أو بلد الاستضافة،
// لذلك لا نعتمد على مطابقة الاسم + الدولة الثابتة مثل باقي TARGET_LEAGUES)
const AFCON_NAME_PATTERN =
    /africa(n)?\s*(cup of nations|nations cup)|afcon|caf\s*africa\s*cup/i;

async function getTargetLeagues() {
    if (Date.now() - leagueCatalogCache.time < 60 * 60 * 1000) {
        return leagueCatalogCache.data;
    }

    const leagues = await getAllLeagues();

    const targets = leagues.filter(league =>
        league.isActive !== false &&
        (
            TARGET_LEAGUES.some(target =>
                target.name === league.name &&
                target.country === league.countryName
            ) ||
            AFCON_NAME_PATTERN.test(league.name || "")
        )
    );

    if (!targets.some(league => AFCON_NAME_PATTERN.test(league.name || ""))) {
        console.error(
            "المسابقة غير موجودة في GOAL API: Africa Cup of Nations"
        );
    }

    TARGET_LEAGUES.forEach(target => {
        if (!targets.some(league =>
            league.name === target.name &&
            league.countryName === target.country
        )) {
            console.error(
                `المسابقة غير موجودة في GOAL API: ${target.name} (${target.country})`
            );
        }
    });

    leagueCatalogCache.time = Date.now();
    leagueCatalogCache.data = targets;

    return targets;
}

async function getTargetFixtures(date) {
    const cached = targetFixturesCache.get(date);

    if (cached && Date.now() - cached.time < TARGET_FIXTURES_CACHE_TIME) {
        return cached.data;
    }

    const leagues = await getTargetLeagues();
    const fixtures = [];
    const seenIds = new Set();

    for (const league of leagues) {
        const leagueName = `${league.name} (${league.countryName})`;
        const limit = 100;
        let offset = 0;
        let pageCount = 0;

        try {
            while (pageCount < MAX_PAGINATION_PAGES) {

                pageCount++;

                const data = await goalApiJson(
                    `${API_URL}/leagues/${encodeURIComponent(league.id)}/fixtures` +
                    `?from=${encodeURIComponent(date)}&to=${encodeURIComponent(date)}` +
                    `&limit=${limit}&offset=${offset}`
                );
                const page = Array.isArray(data.data) ? data.data : [];

                if (!page.length) {
                    break;
                }

                page.forEach(fixture => {
                    const key = buildFixtureDedupeKey(fixture);
                    if (key && seenIds.has(key)) {
                        return;
                    }
                    if (key) {
                        seenIds.add(key);
                    }
                    fixtures.push(fixture);
                });

                const pagination = data?.pagination || {};
                const hasMore = paginationSaysHasMore(pagination, page.length, limit);

                if (!hasMore) {
                    break;
                }

                offset = nextPaginationOffset(pagination, offset, page.length, limit);
            }

            if (pageCount >= MAX_PAGINATION_PAGES) {
                console.warn(
                    `⚠️ تم بلوغ الحد الأقصى لعدد صفحات pagination للمسابقة ${leagueName}`
                );
            }
        }
        catch (error) {
            console.error(
                `تعذر جلب ${leagueName}: ${error.message}`
            );

            if (error.status === 429) {
                console.error(
                    `تم إيقاف pagination للمسابقة ${leagueName} بسبب rate limit (429)`
                );
            }
        }
    }

    // التكرار محذوف مسبقاً أثناء الجمع عبر seenIds
    const uniqueFixtures = fixtures;

    targetFixturesCache.set(date, {
        time: Date.now(),
        data: uniqueFixtures
    });

    return uniqueFixtures;
}

async function getAllLeagues() {
    if (Date.now() - allLeaguesCache.time < 60 * 60 * 1000) {
        return allLeaguesCache.data;
    }

    const limit = 100;
    const leagues = await fetchAllGoalApiPages(
        offset => `${API_URL}/leagues?limit=${limit}&offset=${offset}`,
        data => Array.isArray(data.data)
            ? data.data
            : Array.isArray(data.leagues)
                ? data.leagues
                : [],
        limit
    );
    const seen = new Set();
    const uniqueLeagues = leagues.filter(league => {
        const key = league?.id ?? league?.leagueId ?? `${league?.name || ""}:${league?.countryName || league?.country || ""}`;
        if (key && seen.has(key)) return false;
        if (key) seen.add(key);
        return true;
    });

    const validLeagues = uniqueLeagues.filter(league => league.isActive !== false);
    allLeaguesCache.time = Date.now();
    allLeaguesCache.data = validLeagues;

    console.log(`[GOAL API] Leagues: ${validLeagues.length}`);
    return validLeagues;
}

async function getAllCountries() {
    if (Date.now() - allCountriesCache.time < 60 * 60 * 1000) {
        return allCountriesCache.data;
    }

    const limit = 100;
    const countries = await fetchAllGoalApiPages(
        offset => `${API_URL}/countries?limit=${limit}&offset=${offset}`,
        data => Array.isArray(data.data)
            ? data.data
            : Array.isArray(data.countries)
                ? data.countries
                : [],
        limit
    );
    const seen = new Set();
    const uniqueCountries = countries.filter(country => {
        const key = country?.id ?? country?.countryId ?? country?.code ?? country?.name;
        if (key && seen.has(key)) return false;
        if (key) seen.add(key);
        return true;
    });

    const validCountries = uniqueCountries.filter(country => country && (country.name || country.countryName || country.code));
    allCountriesCache.time = Date.now();
    allCountriesCache.data = validCountries;

    console.log(`[GOAL API] Countries: ${validCountries.length}`);
    return validCountries;
}

function getLeaguePriority(league) {
    const name = normalizeName(
        `${league.originalName || league.name || ""} ${league.countryName || league.originalCountry || league.country || ""}`
    );

    return getLeagueDisplayPriority(name);
}

function getLeagueDisplayPriority(value) {
    const name = normalizeName(value || '');

    if (/la liga|الدوري الإسباني/.test(name)) return 1;
    if (/(^| )premier league( |$)|الدوري الإنجليزي( الممتاز)?( |$)/.test(name) && !/premier league 2|fkf premier league/.test(name)) return 2;
    if (/botola|البطولة المغربية|الدوري المغربي/.test(name)) return 3;
    if (/bundesliga|الدوري الألماني/.test(name)) return 4;
    if (/serie a|الدوري الإيطالي/.test(name)) return 5;
    if (/ligue 1|الدوري الفرنسي/.test(name)) return 6;
    if (/saudi pro league|saudi professional|الدوري السعودي/.test(name)) return 7;
    if (/egyptian premier|الدوري المصري/.test(name)) return 8;
    if (/eredivisie|الدوري الهولندي/.test(name)) return 9;
    if (/primeira liga|الدوري البرتغالي/.test(name)) return 10;
    if (/süper lig|super lig|الدوري التركي/.test(name)) return 11;
    if (/jupiler pro league|belgian pro league|الدوري البلجيكي/.test(name)) return 12;
    if (/uefa champions league|champions league|دوري أبطال أوروبا/.test(name)) return 13;
    if (/caf champions league|دوري أبطال إفريقيا/.test(name)) return 14;
    if (/fa cup|the fa cup|كأس الاتحاد الإنجليزي|كأس إنجلترا/.test(name)) return 15;
    if (/caf confederation|confederation cup|كأس الكونفدرالية الإفريقية|كأس الاتحاد الإفريقي/.test(name)) return 16;
    if (/king cup|kings cup|كأس خادم الحرمين|كأس الملك السعودي|كأس الاتحاد السعودي/.test(name)) return 17;
    if (/africa.*(cup|nations)|afcon|كأس أمم إفريقيا|كأس أمم أفريقيا/.test(name)) return 18;
    if (/euro|european championship|كأس أمم أوروبا|بطولة أمم أوروبا/.test(name)) return 19;
    if (/(^| )(fifa )?world cup( |$)|كأس العالم/.test(name) && !/club|الأندية/.test(name)) return 20;
    if (/nations league|دوري الأمم/.test(name)) return 21;
    if (/asian cup|كأس آسيا/.test(name)) return 22;
    if (/copa america|كوبا أمريكا/.test(name)) return 23;
    if (/arab cup|arabian gulf cup|كأس العرب|كأس الخليج/.test(name)) return 24;
    if (/europa league|الدوري الأوروبي/.test(name)) return 25;
    if (/conference league|دوري المؤتمر الأوروبي/.test(name)) return 26;
    if (/uefa super cup|كأس السوبر الأوروبي/.test(name)) return 27;

    return 9999;
}

function normalizeStandingRow(row, index) {
    const team = row.team || row.club || row.squad || {};
    const stats = row.stats || row.statistics || row;
    const goalsFor = stats.goalsFor ?? stats.goalsForTotal ?? stats.gf
        ?? stats.overallLeagueGF ?? stats.goals?.for ?? null;
    const goalsAgainst = stats.goalsAgainst ?? stats.goalsAgainstTotal ?? stats.ga
        ?? stats.overallLeagueGA ?? stats.goals?.against ?? null;
    const played = stats.played ?? stats.matchesPlayed ?? stats.mp
        ?? stats.overallLeaguePlayed ?? null;
    const wins = stats.wins ?? stats.won ?? stats.w
        ?? stats.overallLeagueW ?? null;
    const draws = stats.draws ?? stats.d ?? stats.overallLeagueD ?? null;
    const losses = stats.losses ?? stats.l ?? stats.overallLeagueL ?? null;
    const goalDifference = stats.goalDifference ?? stats.gd
        ?? (stats.overallLeagueGF != null && stats.overallLeagueGA != null
            ? Number(stats.overallLeagueGF) - Number(stats.overallLeagueGA)
            : null)
        ?? (goalsFor != null && goalsAgainst != null
            ? Number(goalsFor) - Number(goalsAgainst)
            : null);
    const teamName = team.name ?? row.teamName ?? null;
    const countryCode = normalizeCountryCode(team) || normalizeCountryCode(row);
    if (!teamName) {
        return null;
    }

    const numericValue = value => value == null || value === ""
        ? null
        : Number.isFinite(Number(value))
            ? Number(value)
            : null;

    return {
        position: row.position ?? row.rank ?? row.overallLeaguePosition ?? null,
        team: {
            id: team.id ?? row.teamId,
            name: translateTeam(teamName),
            originalName: teamName,
            countryCode,
            logo: getFootballLogoUrl("team", team, row.team, teamName)
        },
        played: numericValue(played),
        wins: numericValue(wins),
        draws: numericValue(draws),
        losses: numericValue(losses),
        goalsFor: numericValue(goalsFor),
        goalsAgainst: numericValue(goalsAgainst),
        goalDifference: numericValue(goalDifference),
        points: numericValue(stats.points ?? stats.pts ?? stats.overallLeaguePTS),
        form: row.form || stats.form || ""
    };
}

function normalizeStandingsResponse(data) {
    const source = data?.data ?? data;
    const gathered = [];

    function pushRows(value, groupName = '') {
        if (!value) return;

        if (Array.isArray(value)) {
            if (value.length && Array.isArray(value[0]?.rows)) {
                value.forEach((item, index) => pushRows(
                    item.rows,
                    item.name || item.group || item.groupName || item.label || `المجموعة ${String.fromCharCode(65 + index)}`
                ));
                return;
            }

            if (value.length && Array.isArray(value[0]?.table)) {
                value.forEach((item, index) => pushRows(
                    item.table,
                    item.name || item.group || item.groupName || item.label || `المجموعة ${String.fromCharCode(65 + index)}`
                ));
                return;
            }

            const rowGroups = new Map();
            value.forEach(row => {
                const rowGroup = row?.leagueRound?.name
                    || row?.leagueRound
                    || row?.league_round?.name
                    || row?.league_round
                    || row?.group?.name
                    || (typeof row?.group === 'string' ? row.group : '')
                    || row?.groupName
                    || row?.group_name
                    || row?.round?.name
                    || row?.round
                    || row?.stage?.name
                    || row?.stageName
                    || '';
                if (rowGroup) {
                    if (!rowGroups.has(rowGroup)) rowGroups.set(rowGroup, []);
                    rowGroups.get(rowGroup).push(row);
                }
            });

            if (rowGroups.size) {
                rowGroups.forEach((rows, name) => gathered.push({ name, rows }));
            }
            else {
                gathered.push({ name: groupName, rows: value });
            }
            return;
        }

        if (Array.isArray(value?.standings)) {
            pushRows(value.standings, value.name || value.group || value.groupName || value.label || groupName);
            return;
        }

        if (Array.isArray(value?.table)) {
            gathered.push({ name: value.name || value.group || value.groupName || value.label || groupName, rows: value.table });
            return;
        }

        if (Array.isArray(value?.rows)) {
            gathered.push({ name: value.name || value.group || value.groupName || value.label || groupName, rows: value.rows });
        }
    }

    pushRows(source);

    const normalizeRows = rows => {
        const deduped = new Map();
        rows
            .map(normalizeStandingRow)
            .filter(Boolean)
            .forEach(row => {
                const key = `${row.team?.id || row.team?.originalName || row.team?.name || row.position || ''}`;
                const previous = deduped.get(key);
                if (!previous || Number(row.points || 0) > Number(previous.points || 0)) {
                    deduped.set(key, row);
                }
            });

        return [...deduped.values()].sort((a, b) => Number(a.position ?? 999) - Number(b.position ?? 999));
    };

    const standingsGroups = gathered
        .filter(group => Array.isArray(group.rows) && group.rows.length)
        .map((group, index) => ({
            name: group.name || `المجموعة ${String.fromCharCode(65 + index)}`,
            standings: normalizeRows(group.rows)
        }))
        .filter(group => group.standings.length)
        .sort((first, second) => first.name.localeCompare(second.name, "en", { numeric: true }));

    return {
        standings: standingsGroups[0]?.standings || [],
        standingsGroups
    };
}

function normalizeTopScorersResponse(data) {
    const source = data?.data ?? data;
    const rows = [
        source?.topScorers,
        source?.top_scorers,
        source?.scorers,
        source?.players,
        source?.rows,
        Array.isArray(source) ? source : null
    ].find(Array.isArray) || [];
    const numericValue = value => value == null || value === ''
        ? null
        : Number.isFinite(Number(value)) ? Number(value) : null;

    return rows.map((row, index) => {
        const player = row.player || row.person || row.athlete || row;
        const team = row.team || row.club || row.squad || {};
        const teamName = team.name || row.teamName || '';
        const goals = numericValue(row.goals ?? row.goalsTotal ?? row.totalGoals
            ?? row.statistics?.goals ?? row.stats?.goals ?? player.goals);
        const name = player.name || row.playerName || row.name || '';
        if (!name || goals == null) return null;
        const apiRank = numericValue(row.rank ?? row.position ?? row.place ?? row.playerPlace);
        return {
            rank: apiRank || index + 1,
            name: translateTeam(name),
            originalName: name,
            goals,
            appearances: numericValue(row.appearances ?? row.matches ?? row.games ?? row.stats?.appearances),
            photo: player.photo || player.image || player.picture || row.photo || '',
            team: {
                id: team.id ?? row.teamId,
                name: translateTeam(teamName),
                originalName: teamName,
                logo: getFootballLogoUrl("team", team, row.team, teamName)
            }
        };
    }).filter(Boolean).sort((a, b) => a.rank - b.rank || b.goals - a.goals);
}

app.get("/api/leagues", async (req, res) => {
    try {
        if (!HAS_API_KEY) {
            return res.status(500).json({ success: false, error: "GOAL_API_KEY غير موجود في ملف .env" });
        }

        const leagues = (await getAllLeagues())
            .map(league => ({
                id: league.id,
                name: translateLeague(league.id, league.name, league.countryName || league.country),
                originalName: league.name,
                country: translateCountry(league.countryName || league.country || "دولي"),
                originalCountry: league.countryName || league.country || "International",
                logo: getFootballLogoUrl("league", league, league.name, league.id),
                seasonId: league.currentSeason?.id || league.currentSeason?.seasonId || league.season?.id || league.season?.seasonId || "",
                season: league.currentSeason?.name || league.currentSeason?.year || league.season?.name || league.season?.year || league.currentSeason || league.season || ""
            }))
            .sort((a, b) => getLeaguePriority(a) - getLeaguePriority(b) || a.name.localeCompare(b.name, "ar"));

        res.json({ success: true, leagues });
    }
    catch (error) {
        console.error("تعذر جلب الدوريات:", error.message);
        res.status(error.status || 500).json({ success: false, error: "تعذر تحميل الدوريات" });
    }
});

app.get("/api/countries", async (req, res) => {
    try {
        if (!HAS_API_KEY) {
            return res.status(500).json({ success: false, error: "GOAL_API_KEY غير موجود في ملف .env" });
        }

        const countries = (await getAllCountries())
            .map(country => ({
                id: country.id || country.countryId || country.code || country.name,
                name: translateCountry(country.name || country.countryName || country.title || country.label || "غير معروف"),
                originalName: country.name || country.countryName || country.title || country.label || "",
                code: country.code || country.countryCode || country.iso || "",
                flag: country.flag || country.flagUrl || country.logo || "",
                slug: country.slug || country.url || "",
                originalName: country.name || country.countryName || country.title || country.label || ""
            }))
            .sort((a, b) => a.name.localeCompare(b.name, "ar"));

        res.json({ success: true, countries, count: countries.length });
    }
    catch (error) {
        console.error("تعذر جلب الدول:", error.message);
        res.status(error.status || 500).json({ success: false, error: "تعذر تحميل الدول" });
    }
});

app.get("/api/league-fixtures/:leagueId", async (req, res) => {
    try {
        if (!HAS_API_KEY) {
            return res.status(500).json({ success: false, error: "GOAL_API_KEY غير موجود في ملف .env" });
        }

        const allMatches = /^(1|true|yes|all)$/i.test(String(req.query.all || ""));
        const requestedDate = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || "")
            ? req.query.date
            : "";

        const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || "")
            ? req.query.from
            : (requestedDate || new Date().toISOString().slice(0, 10));

        const toDate = new Date(`${from}T12:00:00Z`);
        toDate.setUTCDate(toDate.getUTCDate() + 1);
        const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || "")
            ? req.query.to
            : toDate.toISOString().slice(0, 10);

        const season = String(req.query.season || "").trim();
        const fixtures = [];
        const seenFixtureIds = new Set();
        const limit = 100;
        let offset = 0;
        let pageCount = 0;

        while (pageCount < MAX_PAGINATION_PAGES) {
            pageCount++;
            const seasonQuery = season ? `&season=${encodeURIComponent(season)}` : "";
            const data = await goalApiJson(
                `${API_URL}/leagues/${encodeURIComponent(req.params.leagueId)}/fixtures` +
                `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${seasonQuery}&limit=${limit}&offset=${offset}`
            );
            const page = Array.isArray(data)
                ? data
                : Array.isArray(data.data)
                    ? data.data
                    : Array.isArray(data.data?.fixtures)
                        ? data.data.fixtures
                        : Array.isArray(data.data?.events)
                            ? data.data.events
                            : Array.isArray(data.fixtures)
                                ? data.fixtures
                                : Array.isArray(data.events)
                                    ? data.events
                                    : [];

            if (!page.length) {
                break;
            }

            page.forEach(fixture => {
                const key = buildFixtureDedupeKey(fixture);
                if (key && seenFixtureIds.has(key)) {
                    return;
                }
                if (key) {
                    seenFixtureIds.add(key);
                }
                fixtures.push(fixture);
            });

            const pagination = data?.pagination || {};
            const hasMore = paginationSaysHasMore(pagination, page.length, limit);
            if (!hasMore) {
                break;
            }
            offset = nextPaginationOffset(pagination, offset, page.length, limit);
        }

        if (pageCount >= MAX_PAGINATION_PAGES) {
            console.warn(`⚠️ تم بلوغ الحد الأقصى لعدد صفحات pagination لمباريات الدوري ${req.params.leagueId}`);
        }

        const normalizedFixtures = fixtures
            .filter(event => {
                if (allMatches) return true;
                const dateValue = event.kickoffUtc || event.startTime || event.date || event.matchDate || '';
                return String(dateValue).slice(0, 10) === (requestedDate || from);
            })
            .map(applyGoalApiLogosToRawFixture);

        const translatedFixtures = translateTeamFixtureNames(normalizedFixtures);

        res.json({
            success: true,
            all: allMatches,
            selectedDate: allMatches ? null : (requestedDate || from),
            from,
            to,
            fixtures: translatedFixtures
        });
    }
    catch (error) {
        console.error("تعذر جلب مباريات البطولة:", error.message);
        res.status(error.status || 500).json({ success: false, error: "تعذر تحميل مباريات البطولة" });
    }
});

app.get("/api/standings/:leagueId", async (req, res) => {
    try {
        if (!HAS_API_KEY) {
            return res.status(500).json({ success: false, error: "GOAL_API_KEY غير موجود في ملف .env" });
        }

        const leagueId = req.params.leagueId;
        const season = String(req.query.season || "").trim();
        const cachedKey = `${leagueId}:${season || "current"}`;
        const cached = standingsCache.get(cachedKey);

        if (cached && Date.now() - cached.time < STANDINGS_CACHE_TIME) {
            return res.json(cached.data);
        }

        const url = new URL(`${API_URL}/standings/${encodeURIComponent(leagueId)}`);
        if (season) {
            url.searchParams.set("season", season);
        }

        const data = await goalApiJson(url.toString());
        const normalizedStandings = normalizeStandingsResponse(data);
        const result = {
            success: true,
            leagueId,
            historical: false,
            season: data?.season || data?.data?.season || data?.standings?.season || season || "",
            note: "يعرض هذا الجدول آخر ترتيب حقيقي متاح من Goal API، لأن endpoint الترتيب لا يدعم التاريخ.",
            standings: normalizedStandings.standings,
            standingsGroups: normalizedStandings.standingsGroups
        };

        standingsCache.set(cachedKey, { time: Date.now(), data: result });
        res.json(result);
    }
    catch (error) {
        console.error(`تعذر جلب ترتيب الدوري ${req.params.leagueId}:`, error.message);
        res.status(error.status || 500).json({ success: false, error: "تعذر تحميل الترتيب" });
    }
});

app.get("/api/top-scorers/:leagueId", async (req, res) => {
    try {
        if (!HAS_API_KEY) {
            return res.status(500).json({ success: false, error: "GOAL_API_KEY غير موجود في ملف .env" });
        }

        const leagueId = req.params.leagueId;
        const season = String(req.query.season || TOP_SCORERS_SEASON).trim();
        const cacheKey = `${leagueId}:${season || "current"}`;
        const cached = topScorersCache.get(cacheKey);
        if (cached && Date.now() - cached.time < TOP_SCORERS_CACHE_TIME) {
            return res.json(cached.data);
        }

        const seasonQuery = season ? `?season=${encodeURIComponent(season)}` : '';
        const urls = [
            `${API_URL}/leagues/${encodeURIComponent(leagueId)}/top-scorers${seasonQuery}`,
            `${API_URL}/leagues/${encodeURIComponent(leagueId)}/top-scorers`
        ];
        let data;
        let lastError;
        for (const url of urls) {
            try {
                data = await goalApiJson(url);
                break;
            }
            catch (error) {
                lastError = error;
            }
        }
        if (!data) throw lastError || new Error("تعذر جلب الهدافين");

        const result = {
            success: true,
            leagueId,
            season: data?.season || data?.data?.season || season,
            scope: 'season',
            scorers: normalizeTopScorersResponse(data)
        };
        topScorersCache.set(cacheKey, { time: Date.now(), data: result });
        res.json(result);
    }
    catch (error) {
        console.error(`تعذر جلب هدافي الدوري ${req.params.leagueId}:`, error.message);
        res.status(error.status || 500).json({ success: false, error: "تعذر تحميل هدافي البطولة" });
    }
});

app.get("/api/fixtures/:fixtureId", async (req, res) => {
    try {
        if (!HAS_API_KEY) {
            return res.status(500).json({ success: false, error: "GOAL_API_KEY غير موجود في ملف .env" });
        }

        const fixtureId = String(req.params.fixtureId || '').trim();
        if (!fixtureId) {
            return res.status(400).json({ success: false, error: "معرف المباراة غير صالح" });
        }

        const fixtureData = await goalApiJson(`${API_URL}/fixtures/${encodeURIComponent(fixtureId)}`);
        const fixture = translateTeamFixtureNames([
            applyGoalApiLogosToRawFixture(
                fixtureData?.data?.fixture || fixtureData?.fixture || fixtureData?.data || fixtureData
            )
        ])[0];
        const homeTeamId = fixture?.homeTeamId || fixture?.homeTeam?.id || fixture?.teams?.home?.id;
        const awayTeamId = fixture?.awayTeamId || fixture?.awayTeam?.id || fixture?.teams?.away?.id;
        const optionalRequests = [
            [`lineups`, `${API_URL}/fixtures/${encodeURIComponent(fixtureId)}/lineups`],
            [`statistics`, `${API_URL}/fixtures/${encodeURIComponent(fixtureId)}/statistics`]
        ];

        if (homeTeamId && awayTeamId) {
            optionalRequests.push([
                `headToHead`,
                `${API_URL}/h2h/${encodeURIComponent(homeTeamId)}/${encodeURIComponent(awayTeamId)}/direct`
            ]);
        }

        const optionalResults = await Promise.all(optionalRequests.map(async ([key, url]) => {
            try {
                const data = await goalApiJson(url);
                return [key, data?.data ?? data];
            }
            catch (error) {
                console.warn(`تعذر جلب ${key} للمباراة ${fixtureId}:`, error.message);
                return [key, null];
            }
        }));

        const details = Object.fromEntries(optionalResults);
        details.headToHead = translateHeadToHeadNames(details.headToHead);
        res.json({
            success: true,
            fixture,
            lineups: details.lineups,
            statistics: details.statistics,
            headToHead: details.headToHead
        });
    }
    catch (error) {
        console.error(`تعذر جلب تفاصيل المباراة ${req.params.fixtureId}:`, error.message);
        res.status(error.status || 500).json({ success: false, error: "تعذر تحميل تفاصيل المباراة" });
    }
});

app.get("/api/teams/:teamId/overview", async (req, res) => {
    try {
        if (!HAS_API_KEY) {
            return res.status(500).json({ success: false, error: "GOAL_API_KEY غير موجود في ملف .env" });
        }

        const teamId = String(req.params.teamId || '').trim();
        const season = String(req.query.season || '').trim();
        if (!teamId) return res.status(400).json({ success: false, error: "معرف الفريق غير صالح" });

        const fetchCollection = async (path) => {
            const items = [];
            const limit = 100;
            let offset = 0;
            for (let page = 0; page < MAX_PAGINATION_PAGES; page++) {
                const separator = path.includes('?') ? '&' : '?';
                const query = `${separator}limit=${limit}&offset=${offset}${season ? `&season=${encodeURIComponent(season)}` : ''}`;
                const data = await goalApiJson(`${API_URL}${path}${query}`);
                const pageItems = Array.isArray(data?.data) ? data.data
                    : Array.isArray(data?.fixtures) ? data.fixtures
                        : Array.isArray(data?.results) ? data.results
                            : Array.isArray(data) ? data : [];
                if (!pageItems.length) break;
                items.push(...pageItems);
                const pagination = data?.pagination || {};
                if (!paginationSaysHasMore(pagination, pageItems.length, limit)) break;
                offset = nextPaginationOffset(pagination, offset, pageItems.length, limit);
            }
            return items;
        };

        const [teamData, fixtures, results] = await Promise.all([
            goalApiJson(`${API_URL}/teams/${encodeURIComponent(teamId)}`),
            fetchCollection(`/teams/${encodeURIComponent(teamId)}/fixtures`),
            fetchCollection(`/teams/${encodeURIComponent(teamId)}/results`)
        ]);

        const team = teamData?.data?.team || teamData?.team || teamData?.data || teamData;
        const teamWithGoalApiLogo = team && typeof team === 'object'
            ? {
                ...team,
                logo: getFootballLogoUrl("team", team),
                badge: getFootballLogoUrl("team", team),
                crest: getFootballLogoUrl("team", team)
            }
            : team;
        const translatedTeam = teamWithGoalApiLogo && typeof teamWithGoalApiLogo === 'object'
            ? { ...teamWithGoalApiLogo, name: teamWithGoalApiLogo.name ? translateTeam(teamWithGoalApiLogo.name) : teamWithGoalApiLogo.name }
            : teamWithGoalApiLogo;
        res.json({
            success: true,
            team: translatedTeam,
            fixtures: translateTeamFixtureNames(fixtures.map(applyGoalApiLogosToRawFixture)),
            results: translateTeamFixtureNames(results.map(applyGoalApiLogosToRawFixture)),
            season
        });
    }
    catch (error) {
        console.error(`تعذر جلب صفحة الفريق ${req.params.teamId}:`, error.message);
        res.status(error.status || 500).json({ success: false, error: "تعذر تحميل بيانات الفريق" });
    }
});


// =============================================
// LEAGUE PRIORITY
// الدوريات المهمة تظهر أولاً
// =============================================

const leaguePriority = {

    // =========================================
    // EUROPE
    // =========================================

    "الدوري الإسباني": 1,
    "الدوري الإنجليزي": 2,
    "الدوري الإنجليزي الممتاز": 2,
    "دوري أبطال أوروبا": 3,
    "دوري أبطال إفريقيا": 4,
    "كأس الاتحاد الإنجليزي": 5,
    "كأس الكونفدرالية الإفريقية": 6,
    "كأس الاتحاد الإفريقي": 6,
    "كأس خادم الحرمين الشريفين": 7,
    "كأس الملك السعودي": 7,
    "كأس الاتحاد السعودي": 7,
    "الدوري السعودي": 8,
    "الدوري السعودي للمحترفين": 8,
    "الدوري الفرنسي": 9,
    "كأس أمم إفريقيا": 10,
    "كأس أمم أفريقيا": 10,
    "كأس أمم أوروبا": 11,
    "بطولة أمم أوروبا": 11,
    "الدوري الألماني": 13,
    "الدوري الإيطالي": 12,


    // =========================================
    // MOROCCO / ARAB
    // =========================================

    "البطولة المغربية الاحترافية": 7,

    "الدوري المصري الممتاز": 8,

    "الدوري السعودي للمحترفين": 9,


    // =========================================
    // AFRICA
    // =========================================

    "دوري أبطال إفريقيا": 10,

    "كأس الكونفدرالية الإفريقية": 11,

    "كأس السوبر الإفريقي": 12,


    // =========================================
    // EUROPE CUPS
    // =========================================

    "الدوري الأوروبي": 13,

    "دوري المؤتمر الأوروبي": 14,

    "كأس السوبر الأوروبي": 15,


    // =========================================
    // INTERNATIONAL
    // =========================================

    "كأس العالم": 16,

    "كأس العالم للأندية": 17,

    "كأس أمم إفريقيا": 18,

    "كأس أمم إفريقيا للمحليين": 19,


    // =========================================
    // OTHER IMPORTANT
    // =========================================

    "الدوري البرتغالي": 20,

    "الدوري الهولندي": 21,

    "الدوري التركي": 22,

    "الدوري البلجيكي": 23

};


// =============================================
// SORT LEAGUES
// =============================================

function sortLeagues(leagues) {

    return leagues.sort(

        (
            a,
            b
        ) => {


            const priorityA = getLeagueDisplayPriority(
                `${a.leagueName || ''} ${a.country || ''}`
            );

            const priorityB = getLeagueDisplayPriority(
                `${b.leagueName || ''} ${b.country || ''}`
            );


            // =================================
            // IMPORTANT LEAGUES FIRST
            // =================================

            if (
                priorityA !== priorityB
            ) {

                return (
                    priorityA -
                    priorityB
                );

            }


            // =================================
            // SAME PRIORITY
            // SORT ALPHABETICALLY
            // =================================

            return (
                a.leagueName ||
                ""
            )
            .localeCompare(

                b.leagueName ||
                "",

                "ar"

            );

        }

    );

}


// =============================================
// SORT MATCHES
// =============================================

function sortMatches(matches) {

    return matches.sort(

        (
            a,
            b
        ) => {

            return (
                a.timestamp ||
                0
            )
            -
            (
                b.timestamp ||
                0
            );

        }

    );

}


// =============================================
// GET FIXTURES
// =============================================

function normalizeBroadcastTeamName(value) {
    return String(value || "")
        .normalize("NFD")
        .toLowerCase()
        .replace(/[\u0300-\u036f\u064b-\u065f\u0670]/g, "")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
}

app.get("/api/bzzoiro/broadcasts", async (req, res) => {
    const date = String(req.query.date || "");
    const homeNames = [req.query.home, req.query.homeOriginal]
        .map(normalizeBroadcastTeamName)
        .filter(Boolean);
    const awayNames = [req.query.away, req.query.awayOriginal]
        .map(normalizeBroadcastTeamName)
        .filter(Boolean);
    const countryCode = String(req.query.countryCode || "MA").toUpperCase();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !homeNames.length || !awayNames.length) {
        return res.status(400).json({ success: false, channels: [], error: "بيانات المباراة غير مكتملة" });
    }

    if (!/^[A-Z]{2}$/.test(countryCode)) {
        return res.status(400).json({ success: false, channels: [], error: "رمز البلد غير صالح" });
    }

    if (!BZZOIRO_API_KEY) {
        return res.status(503).json({ success: false, channels: [], configured: false });
    }

    const url = new URL(`${BZZOIRO_API_URL}/broadcasts/`);
    url.searchParams.set("date_from", date);
    url.searchParams.set("date_to", date);
    url.searchParams.set("country_code", countryCode);
    url.searchParams.set("limit", "200");

    try {
        const response = await fetch(url, {
            headers: {
                Authorization: `Token ${BZZOIRO_API_KEY}`,
                Accept: "application/json"
            }
        });

        if (!response.ok) {
            console.warn(`تعذر جلب قنوات BSD: ${response.status}`);
            return res.status(502).json({ success: false, channels: [] });
        }

        const data = await response.json();
        const broadcasts = Array.isArray(data) ? data : data.results || [];
        const matchingBroadcasts = broadcasts.filter(broadcast => {
            const broadcastHome = normalizeBroadcastTeamName(broadcast.home_team?.name || broadcast.home_team);
            const broadcastAway = normalizeBroadcastTeamName(broadcast.away_team?.name || broadcast.away_team);
            return homeNames.includes(broadcastHome) && awayNames.includes(broadcastAway);
        });
        const channels = [...new Set(matchingBroadcasts
            .map(broadcast => String(broadcast.channel_name || broadcast.channel?.name || "").trim())
            .filter(Boolean))];

        return res.json({ success: true, countryCode, channels });
    }
    catch (error) {
        console.error("تعذر جلب قنوات BSD:", error.message);
        return res.status(502).json({ success: false, channels: [] });
    }
});

app.get(

    "/api/fixtures",

    async (
        req,
        res
    ) => {


        try {


            // =================================
            // CHECK API KEY
            // =================================

            if (!HAS_API_KEY) {

                return res
                .status(500)
                .json({

                    success:

                        false,


                    error:

                        "GOAL_API_KEY غير موجود في ملف .env"

                });

            }


            // =================================
            // GET DATE
            // =================================

            const date =
                req.query.date;


            if (!date) {

                return res
                .status(400)
                .json({

                    success:

                        false,


                    error:

                        "يجب إرسال التاريخ"

                });

            }


            // =================================
            // VALIDATE DATE
            // =================================

            const validDate =
                /^\d{4}-\d{2}-\d{2}$/;


            if (
                !validDate.test(date)
            ) {

                return res
                .status(400)
                .json({

                    success:

                        false,


                    error:

                        "صيغة التاريخ يجب أن تكون YYYY-MM-DD"

                });

            }


            // =================================
            // CHECK CACHE
            // =================================

            const cached =
                cache.get(date);


            if (
                cached &&
                (
                    Date.now()
                    -
                    cached.time
                    <
                    CACHE_TIME
                )
            ) {

                console.log(
                    `📦 Cache used: ${date}`
                );


                return res.json(
                    translateFixtureNames(cached.data)
                );

            }


            console.log("");
            console.log(
                "📅 جاري جلب مباريات:",
                date
            );


            // =================================
            // API REQUEST - ALL FIXTURES FOR THE DAY
            // لا نستخدم قائمة ثابتة للدوريات ولا نستبعد المنتخبات
            // ونجلب كل الصفحات المتوفرة (بدون limit ثابت مثل 10/20)
            // =================================

            const allDateEvents = await fetchAllDateFixtures(date);

            console.log(`[GOAL API] Fixtures ${date}: ${allDateEvents.length}`);

            if (!allDateEvents.length) {
                console.warn(`⚠️ لا توجد مباريات متاحة لهذا التاريخ من GOAL API: ${date}`);
                return res.status(200).json({
                    success: true,
                    date,
                    count: 0,
                    leagueCount: 0,
                    leagues: [],
                    message: "لا توجد مباريات متاحة لهذا التاريخ من GOAL API",
                    reason: "empty response from GOAL API"
                });
            }

            const nationalTeamFixtures = allDateEvents.filter(event => getFixtureTypeMeta(event).national).length;
            const clubFixtures = allDateEvents.filter(event => getFixtureTypeMeta(event).club).length;
            const competitionsCount = new Set(
                allDateEvents
                    .map(event => event.leagueId || event.competition?.id || event.league?.id || event.tournament?.id || event.countryId || event.countryName)
                    .filter(Boolean)
            ).size;

            console.log("DATE:", date);
            console.log("TOTAL FIXTURES:", allDateEvents.length);
            console.log("NATIONAL TEAM FIXTURES:", nationalTeamFixtures);
            console.log("CLUB FIXTURES:", clubFixtures);
            console.log("COMPETITIONS COUNT:", competitionsCount);

            const events = allDateEvents;

            const fixtures =
                events.map(rawEvent => {

                    const event = applyGoalApiLogosToRawFixture(rawEvent);

                    const homeTeam =
                        event.homeTeam || event.home || {};

                    const awayTeam =
                        event.awayTeam || event.away || {};

                    const tournament =
                        event.competition || event.league || event.tournament || {};

                    const category =
                        tournament.country || event.countryName || event.country || {};

                    const status =
                        event.matchStatus || event.status || {};

                    const eventDate =
                        event.kickoffUtc ||
                        event.startTime ||
                        event.date ||
                        null;

                    const homeScore = normalizeScore(
                        event.homeTeamScore ??
                        event.homeTeamFtScore ??
                        event.homeScore ??
                        event.score?.home ??
                        event.home?.score
                    );

                    const awayScore = normalizeScore(
                        event.awayTeamScore ??
                        event.awayTeamFtScore ??
                        event.awayScore ??
                        event.score?.away ??
                        event.away?.score
                    );

                    const rawStatus =
                        typeof status === "string"
                            ? status
                            : status.type || status.short || status.status || "";

                    const normalizedStatus =
                        String(rawStatus)
                            .trim()
                            .toLowerCase()
                            .replace(/[ -]/g, "_");

                    const statusShort =
                        event.matchLive === true ||
                            ["live", "inprogress", "in_progress", "in_play", "inplay"].includes(normalizedStatus)
                            ? "LIVE"
                            : ["finished", "ft", "aet", "pen", "awarded", "completed", "complete", "ended", "end"].includes(normalizedStatus)
                                ? "FT"
                                : ["canceled", "cancelled", "postponed", "pst", "canc"].includes(normalizedStatus)
                                    ? "PST"
                                    : "NS";

                    const homeWinner =
                        homeScore > awayScore
                            ? true
                            : awayScore > homeScore
                                ? false
                                : null;

                    const awayWinner =
                        awayScore > homeScore
                            ? true
                            : homeScore > awayScore
                                ? false
                                : null;

                    return {

                        league: {
                            id: event.leagueId || tournament.id || tournament.competitionId,
                            name: event.leagueName || tournament.name || "بطولة غير معروفة",
                            country: category.name || category || "International",
                            logo: getFootballLogoUrl("league",
                                tournament,
                                event.league,
                                event.competition,
                                event.tournament,
                                { logo: event.leagueLogo },
                                event.leagueName
                            )
                        },

                        fixture: {
                            id: event.id || event.fixtureId,
                            date: eventDate,
                            timestamp: eventDate
                                ? Math.floor(Date.parse(eventDate) / 1000)
                                : 0,
                            round: event.matchRound ?? event.round ?? "",
                            venue: {
                                name: event.matchStadium || event.venue?.name || event.stadium?.name || ""
                            },
                            status: {
                                short: statusShort,
                                long: status.description || status.type || status || "",
                                elapsed: status.elapsed || null
                            }
                        },

                        teams: {
                            home: {
                                id: event.homeTeamId || homeTeam.id,
                                name: event.homeTeamName || homeTeam.name || homeTeam.teamName,
                                logo: getFootballLogoUrl("team", homeTeam, event.home, event.teams?.home, event.homeTeamName),
                                winner: homeWinner
                            },
                            away: {
                                id: event.awayTeamId || awayTeam.id,
                                name: event.awayTeamName || awayTeam.name || awayTeam.teamName,
                                logo: getFootballLogoUrl("team", awayTeam, event.away, event.teams?.away, event.awayTeamName),
                                winner: awayWinner
                            }
                        },

                        homeTeam: {
                            id: event.homeTeamId || homeTeam.id,
                            name: event.homeTeamName || homeTeam.name || homeTeam.teamName,
                            logo: getFootballLogoUrl("team", homeTeam, event.home, event.teams?.home, event.homeTeamName)
                        },

                        awayTeam: {
                            id: event.awayTeamId || awayTeam.id,
                            name: event.awayTeamName || awayTeam.name || awayTeam.teamName,
                            logo: getFootballLogoUrl("team", awayTeam, event.away, event.teams?.away, event.awayTeamName)
                        },

                        goals: {
                            home: homeScore,
                            away: awayScore
                        },

                        score: {
                            period1: {
                                home: event.homeTeamHalftimeScore ?? event.score?.halftime?.home,
                                away: event.awayTeamHalftimeScore ?? event.score?.halftime?.away
                            },
                            current: {
                                home: homeScore,
                                away: awayScore
                            }
                        }

                    };

                });


            console.log(
                `⚽ عدد المباريات: ${fixtures.length}`
            );


            // =================================
            // GROUP LEAGUES
            // =================================

            const leaguesMap =
                {};


            fixtures.forEach(

                item => {


                    // =============================
                    // LEAGUE DATA
                    // =============================

                    const leagueId =
                        item.league?.id;


                    if (
                        !leagueId
                    ) {

                        return;

                    }


                    const originalLeagueName =
                        item.league?.name
                        ||
                        "بطولة غير معروفة";


                    const originalCountry =
                        item.league?.country
                        ||
                        "International";


                    // =============================
                    // TRANSLATE LEAGUE
                    // =============================

                    const leagueName =
                        translateLeague(

                            leagueId,

                            originalLeagueName,

                            originalCountry

                        );


                    // =============================
                    // TRANSLATE COUNTRY
                    // =============================

                    const country =
                        translateCountry(
                            originalCountry
                        );


                    // =============================
                    // CREATE LEAGUE
                    // =============================

                    if (
                        !leaguesMap[leagueId]
                    ) {

                        leaguesMap[
                            leagueId
                        ] = {

                            // League ID

                            leagueId:


                                leagueId,


                            // Arabic League Name

                            leagueName:


                                leagueName,


                            round:


                                item.fixture?.round
                                || item.matchRound
                                || item.round
                                || "",


                            // Original League Name

                            leagueOriginalName:


                                originalLeagueName,


                            // Country

                            country:


                                country,


                            countryOriginal:


                                originalCountry,


                            // League Logo

                            leagueLogo:

                                getFootballLogoUrl("league", item.league, originalLeagueName, leagueId),


                            // Matches

                            matches:


                                []

                        };

                    }

                    if (!leaguesMap[leagueId].round) {
                        leaguesMap[leagueId].round =
                            item.fixture?.round
                            || item.matchRound
                            || item.round
                            || "";
                    }


                    // =============================
                    // HOME TEAM
                    // =============================

                    const originalHomeName =
                        item.teams?.home?.name
                        ||
                        "الفريق الأول";


                    const homeName =
                        translateTeam(
                            item.teams?.home || originalHomeName
                        );


                    // =============================
                    // AWAY TEAM
                    // =============================

                    const originalAwayName =
                        item.teams?.away?.name
                        ||
                        "الفريق الثاني";


                    const awayName =
                        translateTeam(
                            item.teams?.away || originalAwayName
                        );


                    const homeLogo = getFootballLogoUrl("team", item.teams?.home, originalHomeName);
                    const awayLogo = getFootballLogoUrl("team", item.teams?.away, originalAwayName);


                    // =============================
                    // FIXTURE DATA
                    // =============================

                    leaguesMap[
                        leagueId
                    ]
                    .matches
                    .push({

                        // =========================
                        // FIXTURE ID
                        // =========================

                        id:

                            item.fixture?.id,


                        // =========================
                        // DATE
                        // =========================

                        date:

                            item.fixture?.date,


                        // =========================
                        // TIMESTAMP
                        // =========================

                        timestamp:

                            item.fixture?.timestamp,


                        // =========================
                        // VENUE
                        // =========================

                        venue:

                            item.fixture?.venue?.name
                            ||
                            "",


                        // =========================
                        // STATUS
                        // =========================

                        status:

                            getMatchStatus(
                                item.fixture?.status
                            ),


                        statusShort:

                            item.fixture?.status?.short
                            ||
                            "",


                        statusLong:

                            item.fixture?.status?.long
                            ||
                            "",


                        elapsed:

                            item.fixture?.status?.elapsed,


                        // =========================
                        // HOME
                        // =========================

                        home: {

                            id:

                                item.teams?.home?.id,


                            name:

                                homeName,


                            originalName:

                                originalHomeName,


                            logo:

                                homeLogo,


                            winner:

                                item.teams?.home?.winner

                        },


                        // =========================
                        // AWAY
                        // =========================

                        away: {

                            id:

                                item.teams?.away?.id,


                            name:

                                awayName,


                            originalName:

                                originalAwayName,


                            logo:

                                awayLogo,


                            winner:

                                item.teams?.away?.winner

                        },


                        homeTeam: {

                            id:

                                item.teams?.home?.id,


                            name:

                                homeName,


                            logo:

                                homeLogo

                        },


                        awayTeam: {

                            id:

                                item.teams?.away?.id,


                            name:

                                awayName,


                            logo:

                                awayLogo

                        },


                        // =========================
                        // GOALS
                        // =========================

                        goals: {

                            home:

                                item.goals?.home,


                            away:

                                item.goals?.away

                        },


                        // =========================
                        // SCORE
                        // =========================

                        score:

                            item.score
                            ||
                            {}

                    });


                }

            );


            // =================================
            // OBJECT TO ARRAY
            // =================================

            let leagues =
                Object.values(
                    leaguesMap
                );


            // =================================
            // SORT MATCHES
            // =================================

            leagues.forEach(

                league => {

                    league.matches =
                        sortMatches(
                            league.matches
                        );

                }

            );


            // =================================
            // SORT LEAGUES
            // =================================

            leagues =
                sortLeagues(
                    leagues
                );


            // =================================
            // FINAL RESULT
            // =================================

            const result = {

                success:

                    true,


                date:

                    date,


                count:

                    fixtures.length,


                leagueCount:

                    leagues.length,


                leagues:

                    leagues

            };


            // =================================
            // SAVE CACHE
            // =================================

            translateFixtureNames(result);

            cache.set(

                date,

                {

                    time:

                        Date.now(),


                    data:

                        result

                }

            );


            // =================================
            // CLEAN OLD CACHE
            // =================================

            if (
                cache.size > 10
            ) {

                const oldestKey =
                    cache.keys()
                    .next()
                    .value;


                cache.delete(
                    oldestKey
                );

            }


            console.log(
                `🏆 عدد البطولات: ${leagues.length}`
            );


            console.log(
                "✅ تم إرسال البيانات"
            );


            // =================================
            // RESPONSE
            // =================================

            res.json(
                result
            );


        }
        catch (
            error
        ) {

            const response =
                error && error.response
                    ? error.response
                    : null;

            const errorStatus =
                response?.status
                ?? error?.status
                ?? "غير متاح";

            const errorData =
                response?.data
                ?? error?.details
                ?? null;

            console.error("GOAL API Error Message:", error?.message || String(error));
            console.error("GOAL API Error Code:", error?.code || "غير متاح");
            console.error("GOAL API Error Status:", errorStatus);
            console.error("GOAL API Error Data:", errorData || "غير متاح");


            console.error("");
            console.error("=================================");
            console.error("❌ SERVER ERROR");
            console.error("=================================");
            console.error(
                error
            );
            console.error("=================================");
            console.error("");


            res
            .status(500)
            .json({

                success:

                    false,


                error:

                    "حدث خطأ في الخادم",


                message:

                    error.message

            });


        }


    }

);


// =============================================
// API TEST
// =============================================

app.get(

    "/api/test",

    async (
        req,
        res
    ) => {

        try {
            const liveLeagues = HAS_API_KEY ? await getAllLeagues() : [];
            const liveCountries = HAS_API_KEY ? await getAllCountries() : [];

            res.json({
                success: true,
                message: "السيرفر يعمل بنجاح",
                server: "Football Live",
                apiKey: HAS_API_KEY ? "موجودة ✅" : "غير موجودة ❌",
                live: {
                    leagues: liveLeagues.length,
                    countries: liveCountries.length
                },
                translations: {
                    teams: Object.keys(translations.teams).length,
                    leagueIds: Object.keys(translations.leagueIds).length,
                    leagueCountry: Object.keys(translations.leagueCountry).length,
                    leagues: Object.keys(translations.leagues).length,
                    countries: Object.keys(translations.countries).length
                },
                cache: {
                    items: cache.size,
                    duration: "5 دقائق"
                }
            });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: "تعذر التحقق من بيانات GOAL API",
                message: error.message
            });
        }

    }

);


// =============================================
// TRANSLATION TEST
// =============================================

app.get(

    "/api/translate",

    (
        req,
        res
    ) => {


        const name =
            req.query.name;


        const country =
            req.query.country;


        const leagueId =
            req.query.leagueId;


        if (!name) {

            return res
            .status(400)
            .json({

                success:

                    false,


                error:

                    "أرسل name"

            });

        }


        res.json({

            success:

                true,


            original:

                {

                    name:

                        name,


                    country:

                        country || "",


                    leagueId:

                        leagueId || ""

                },


            translations:

                {

                    team:

                        translateTeam(
                            name
                        ),


                    league:

                        translateLeague(

                            leagueId,

                            name,

                            country

                        ),


                    country:

                        translateCountry(
                            name
                        )

                }

        });


    }

);


// =============================================
// CACHE CLEAR
// =============================================

app.get(

    "/api/cache/clear",

    (
        req,
        res
    ) => {


        cache.clear();


        res.json({

            success:

                true,


            message:

                "تم حذف Cache بنجاح"

        });


    }

);


// =============================================
// SPA FALLBACK FOR CLIENT ROUTES
// =============================================

app.get(/^\/match\/.+$/, (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.get(/^\/(?!api\/).*$/, (req, res) => {
    const pathname = req.path || "/";
    if (pathname === "/" || pathname.startsWith("/match/")) {
        return res.sendFile(path.join(__dirname, "index.html"));
    }
    return res.sendFile(path.join(__dirname, "index.html"));
});

// =============================================
// START SERVER
// =============================================

app.listen(

    PORT,

    () => {


        console.log("");
        console.log("==============================================");
        console.log("        ⚽ FOOTBALL LIVE SERVER");
        console.log("==============================================");

        console.log(
            `🌐 Website: http://localhost:${PORT}`
        );

        console.log(
            `🧪 Test: http://localhost:${PORT}/api/test`
        );

        console.log("");

        console.log(

            HAS_API_KEY

            ?

            "🔑 API Key: موجودة ✅"

            :

            "🔑 API Key: غير موجودة ❌"

        );


        console.log("");

        console.log(
            `⚽ Teams: ${
                Object.keys(
                    translations.teams
                ).length
            }`
        );


        console.log(
            `🏆 League IDs: ${
                Object.keys(
                    translations.leagueIds
                ).length
            }`
        );


        console.log(
            `🌍 League Countries: ${
                Object.keys(
                    translations.leagueCountry
                ).length
            }`
        );


        console.log(
            `📦 Cache: النتائج 20 ثانية، الترتيب 45 ثانية، الهدافون 10 دقائق`
        );


        console.log("==============================================");
        console.log("");

    }

);