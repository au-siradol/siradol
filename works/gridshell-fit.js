// Search only through verified equilibria. Bounds describe the UI's extra-length range,
// not a guarantee that all heights are attainable or that the response is monotonic.
export async function searchCrown({ target, min, max, current, evaluate, tolerance = 0.02, maxIterations = 14, cancelled = () => false }) {
    if (![target, min, max, current].every(Number.isFinite) || min <= 0 || max <= min) throw new Error('Invalid fit bounds');
    const samples = [], tried = new Set();
    let failures = 0;
    const trial = async slack => {
        if (cancelled()) return;
        slack = Math.max(min, Math.min(max, slack));
        const key = slack.toPrecision(14);
        if (tried.has(key)) return;
        tried.add(key);
        const result = await evaluate(slack, tried.size);
        if (cancelled()) return;
        if (result?.converged && Number.isFinite(result.height)) samples.push({ ...result, slack });
        else failures++;
    };
    const best = () => samples.reduce((a, b) => !a || Math.abs(b.height - target) < Math.abs(a.height - target) ? b : a, null);
    const matched = () => best() && Math.abs(best().height - target) <= tolerance;
    // Test endpoints before any interval search; never silently extrapolate.
    for (const slack of [min, max, current, Math.sqrt(min * max)]) {
        await trial(slack);
        if (cancelled()) return { status: 'cancelled' };
        if (matched()) return { status: 'matched', best: best(), failures, samples };
    }
    for (let i = 0; i < maxIterations; i++) {
        const sorted = [...samples].sort((a, b) => a.slack - b.slack);
        let bracket = null;
        for (let j = 1; j < sorted.length; j++) {
            const a = sorted[j - 1], b = sorted[j];
            if ((a.height - target) * (b.height - target) < 0) { bracket = [a, b]; break; }
        }
        if (!bracket) break;
        const [a, b] = bracket, before = samples.length;
        await trial(Math.sqrt(a.slack * b.slack));
        if (cancelled()) return { status: 'cancelled' };
        if (matched()) return { status: 'matched', best: best(), failures, samples };
        // A failed solve cannot narrow the height bracket.
        if (samples.length === before) break;
    }
    return { status: samples.length ? 'closest' : 'unconverged', best: best(), failures, samples };
}
