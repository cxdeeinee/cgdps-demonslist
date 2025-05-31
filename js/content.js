import { round, calculateScores } from "./score.js";

/**
 * Path to directory containing `_list.json` and all levels
 */
const dir = "/data";

export async function fetchList() {
    const listResult = await fetch(`${dir}/_list.json`);
    const packResult = await fetch(`${dir}/_packlist.json`);
    try {
        const list = await listResult.json();
        const packsList = await packResult.json();

        return await Promise.all(
            list.map(async (path, rank) => {
                try {
                    const levelResult = await fetch(`${dir}/${path}.json`);
                    const level = await levelResult.json();
                    let packs = packsList.filter((x) =>
                        x.levels.includes(path)
                    );
                    return [
                        {
                            ...level,
                            packs,
                            path,
                            records: level.records.sort(
                                (a, b) => b.percent - a.percent
                            ),
                        },
                        null,
                    ];
                } catch (err) {
                    console.error(`Failed to load level #${rank + 1} (${path}.json):`, err);
                    return [null, path];
                }
            })
        );
    } catch (err) {
        console.error("Failed to load _list.json or _packlist.json:", err);
        return null;
    }
}

export async function fetchEditors() {
    try {
        const editorsResults = await fetch(`${dir}/_editors.json`);
        const editors = await editorsResults.json();
        return editors;
    } catch {
        return null;
    }
}

export async function fetchSupporters() {
    try {
        const supportersResults = await fetch(`${dir}/_supporters.json`);
        const supporters = await supportersResults.json();
        return supporters;
    } catch {
        return null;
    }
}

export async function fetchLeaderboard() {
    const list = await fetchList();
    if (!list) {
        console.error("fetchList() returned null");
        return [[], ["Failed to load list"]];
    }

    const packResult = await (await fetch(`${dir}/_packlist.json`)).json();
    const scoreMap = {};
    const errs = [];
    const packMultiplier = 1.5;
    const scoreLookup = calculateScores(list.length);

    list.forEach(([level, err], rank) => {
        if (err || !level) {
            errs.push(err ?? `Unknown error at rank ${rank}`);
            return;
        }

        // Verification
        const verifier =
            Object.keys(scoreMap).find(
                (u) => u.toLowerCase() === level.verifier.toLowerCase()
            ) || level.verifier;
        scoreMap[verifier] ??= {
            verified: [],
            completed: [],
            progressed: [],
            packs: [],
        };
        scoreMap[verifier].verified.push({
            rank: rank + 1,
            level: level.name,
            score: scoreLookup[rank],
            link: level.verification,
            path: level.path,
        });

        // Records
        level.records.forEach((record) => {
            const user =
                Object.keys(scoreMap).find(
                    (u) => u.toLowerCase() === record.user.toLowerCase()
                ) || record.user;
            scoreMap[user] ??= {
                verified: [],
                completed: [],
                progressed: [],
                packs: [],
            };

            const { completed, progressed } = scoreMap[user];
            if (record.percent === 100) {
                completed.push({
                    rank: rank + 1,
                    level: level.name,
                    score: scoreLookup[rank],
                    link: record.link,
                    path: level.path,
                });
            } else {
                progressed.push({
                    rank: rank + 1,
                    level: level.name,
                    percent: record.percent,
                    score: scoreLookup[rank],
                    link: record.link,
                    path: level.path,
                });
            }
        });
    });

    for (let [username, scores] of Object.entries(scoreMap)) {
        let completedPaths = [
            ...scores.verified,
            ...scores.completed,
        ].map((x) => x.path);

        for (let pack of packResult) {
            if (pack.levels.every((lvl) => completedPaths.includes(lvl))) {
                scores.packs.push(pack);
            }
        }
    }

    const res = Object.entries(scoreMap).map(([user, scores]) => {
        const { verified, completed, progressed } = scores;

        let packScore = 0;
        let packScoreMultiplied = 0;
        for (let pack of scores.packs) {
            const allUserLevels = [...verified, ...completed];
            const packLevelScores = pack.levels
                .map((lvlPath) =>
                    allUserLevels.find((lvl) => lvl.path === lvlPath)
                )
                .filter((lvl) => lvl) // skip undefined
                .map((lvl) => lvl.score);

            packScore += packLevelScores.reduce((a, b) => a + b, 0);
        }
        packScoreMultiplied = packScore * packMultiplier;

        const totalWithoutBonus = [...verified, ...completed, ...progressed].reduce(
            (sum, x) => sum + x.score,
            0
        );
        const total = totalWithoutBonus - packScore + packScoreMultiplied;

        return {
            user,
            total: round(total),
            packBonus: round(total - totalWithoutBonus),
            ...scores,
        };
    });

    return [res.sort((a, b) => b.total - a.total), errs];
}

export async function fetchPacks() {
    try {
        const packResult = await fetch(`${dir}/_packlist.json`);
        return await packResult.json();
    } catch {
        return null;
    }
}

export async function fetchPackLevels(packname) {
    try {
        const packResult = await fetch(`${dir}/_packlist.json`);
        const packsList = await packResult.json();
        const selectedPack = packsList.find((pack) => pack.name === packname);

        if (!selectedPack) {
            console.warn(`Pack not found: ${packname}`);
            return null;
        }

        return await Promise.all(
            selectedPack.levels.map(async (path, rank) => {
                try {
                    const levelResult = await fetch(`${dir}/${path}.json`);
                    const level = await levelResult.json();
                    return [{ level, path }, null];
                } catch (err) {
                    console.error(`Failed to load level #${rank + 1} ${path}.`, err);
                    return [null, path];
                }
            })
        );
    } catch (e) {
        console.error(`Failed to load pack levels:`, e);
        return null;
    }
}
