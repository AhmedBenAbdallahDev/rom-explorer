'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Disc, Globe, Gamepad, X, Filter, ChevronDown, Command, Folder, File, ChevronRight, Home as HomeIcon } from 'lucide-react';

export default function Home() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedTerm, setDebouncedTerm] = useState('');
    const [isGlobalSearch, setIsGlobalSearch] = useState(false);
    const [isDeepSearch, setIsDeepSearch] = useState(false); // Scope: Shallow or Deep
    const [searchTarget, setSearchTarget] = useState('files'); // Target: 'files', 'folders', or 'both'
    const [activeProvider, setActiveProvider] = useState('all');
    const [activeTag, setActiveTag] = useState('all');
    const [showFilters, setShowFilters] = useState(false);

    // Pagination / Infinite Scroll State
    const [visibleCount, setVisibleCount] = useState(40);
    const [loadingGames, setLoadingGames] = useState(false);
    const loadMoreRef = useRef(null);

    // Base URL for Data. In development, it uses local /data folder. 
    // In production, you can set NEXT_PUBLIC_DATA_URL in Vercel to point to your S3/CDN.
    const DATA_BASE_URL = process.env.NEXT_PUBLIC_DATA_URL || '';

    // Using a ref to track if we should capture keys
    const searchInputRef = useRef(null);

    useEffect(() => {
        // Fetch the index data
        fetch(`${DATA_BASE_URL}/data/index.json`)
            .then(res => res.json())
            .then(jsonData => {
                setData(jsonData);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to load data", err);
                setLoading(false);
            });
    }, []);

    // Global Keydown Listener for Auto-Search
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Ignore if active element is an input or textarea
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

            // Ignore special keys
            if (e.ctrlKey || e.metaKey || e.altKey) return;

            // Start searching on standard keys
            if (e.key.length === 1 || e.key === 'Backspace') {
                if (searchInputRef.current) {
                    searchInputRef.current.focus();
                    // We don't prevent default here so the character gets typed into the input
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Data Caching
    const [manifests, setManifests] = useState({});
    const [gameCache, setGameCache] = useState({});

    // Fetch Manifest when entered a Provider
    useEffect(() => {
        if (activeProvider !== 'all' && !manifests[activeProvider]) {
            fetch(`${DATA_BASE_URL}/data/${activeProvider}/_manifest.json`)
                .then(res => res.json())
                .then(json => setManifests(prev => ({ ...prev, [activeProvider]: json })))
                .catch(err => console.error("Failed to load manifest", err));
        }
    }, [activeProvider, manifests]);

    // Fetch Games when entered a Platform (Tag)
    // --- Internet Archive Deep Map Logic ---
    const [platformMap, setPlatformMap] = useState({});

    useEffect(() => {
        // Pre-fetch IA platform map for deep searching even if not currently in IA
        fetch(`${DATA_BASE_URL}/data/Internet_Archive/_platform_map.json`)
            .then(res => res.json())
            .then(map => {
                console.log('Loaded Global Platform Map for IA');
                setPlatformMap(map);
            })
            .catch(err => console.warn("Deep search map not found, basic navigation only."));
    }, []);

    // --- Load Games for Selected Platform ---
    useEffect(() => {
        if (activeProvider === 'all' || activeTag === 'all') return;

        const loadGames = async () => {
            setLoadingGames(true);
            const cacheKey = `${activeProvider}-${activeTag}`;

            // 1. Check Cache
            if (gameCache[cacheKey]) {
                setLoadingGames(false);
                return;
            }

            try {
                let fileUrl = '';
                let isSubFilter = false;

                // 2. Resolve File Path
                const manifestNode = manifests[activeProvider]?.[activeTag];
                if (activeProvider === 'Internet_Archive' && platformMap[activeTag]) {
                    isSubFilter = true;
                }

                // 3. Fetch (Supporting Multi-part Files)
                const files = Array.isArray(manifestNode?.file)
                    ? manifestNode.file
                    : [manifestNode?.file || (activeProvider === 'Internet_Archive' && platformMap[activeTag] ? `Internet_Archive/${platformMap[activeTag]}` : null)];

                if (files.includes(null)) {
                    console.warn(`No file found for tag: ${activeTag}`);
                    setLoadingGames(false);
                    return;
                }

                const fetchPromises = files.map(f => fetch(`${DATA_BASE_URL}/data/${f}`).then(r => r.ok ? r.json() : []));
                const results = await Promise.all(fetchPromises);
                let games = results.flat();

                // 4. Post-Process (Filter if Deep Mapped)
                if (isSubFilter && activeTag) {
                    // Only show games strictly inside this "folder" (tag)
                    games = games.filter(g =>
                        g.path && Array.isArray(g.path) && g.path.some(p => p.includes(activeTag) || p === activeTag)
                    );
                }

                // 5. Update Cache (This triggers UI update via filteredItems)
                setGameCache(prev => ({ ...prev, [cacheKey]: games }));

            } catch (err) {
                console.error("Game load error:", err);
            } finally {
                setLoadingGames(false);
            }
        };

        loadGames();

    }, [activeProvider, activeTag, manifests, platformMap, gameCache]);

    // Data for Deep Search / Path Search
    const [deepSearchResults, setDeepSearchResults] = useState([]);
    const [isSearchingDeep, setIsSearchingDeep] = useState(false);
    const searchAbortController = useRef(null);

    // Debounce Search Term
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedTerm(searchTerm), 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // --- Master Search Engine (Unifying Path & Deep Search) ---
    useEffect(() => {
        // Reset results immediately when search is cleared or modes change
        if (!searchTerm) {
            setDeepSearchResults([]);
            setIsSearchingDeep(false);
            return;
        }

        // Logic to run search
        const timeoutId = setTimeout(async () => {
            setIsSearchingDeep(true);
            setDeepSearchResults([]); // Start fresh for this specific search run

            // Cancel previous running search
            if (searchAbortController.current) {
                searchAbortController.current.abort();
            }
            searchAbortController.current = new AbortController();
            const signal = searchAbortController.current.signal;

            const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9\s]/g, '');
            const normalizedTerm = normalize(searchTerm);
            const searchTokens = normalizedTerm.split(/\s+/).filter(Boolean);

            // MODE 1: Path / Folder Search (Checks local index)
            // Runs if Target is Folders or Both
            if (searchTarget === 'folders' || searchTarget === 'both') {
                let folderMatches = [];
                // Use data.collections for the complete list of folders across all providers
                Object.entries(data.collections).forEach(([provider, pData]) => {
                    if (activeProvider !== 'all' && activeProvider !== provider) return;

                    pData.platforms.forEach(platform => {
                        if (normalize(platform.name).includes(normalizedTerm)) {
                            folderMatches.push({
                                id: `fold-${provider}-${platform.name}`,
                                name: platform.name,
                                provider: provider,
                                type: 'folder',
                                count: platform.count
                            });
                        }
                    });
                });

                if (folderMatches.length > 0) {
                    setDeepSearchResults(prev => [...prev, ...folderMatches]);
                }

                // SUB-MODE: Deep Folder Search (for IA and nested structures)
                if (isDeepSearch) {
                    let deepFolderMatches = [];
                    // Check IA Platform Map
                    if (platformMap) {
                        Object.entries(platformMap).forEach(([subFolder, parentFile]) => {
                            if (normalize(subFolder).includes(normalizedTerm)) {
                                if (activeProvider !== 'all' && activeProvider !== 'Internet_Archive') return;
                                deepFolderMatches.push({
                                    id: `deep-fold-IA-${subFolder}`,
                                    name: subFolder,
                                    provider: 'Internet_Archive',
                                    type: 'folder',
                                    breadcrumb: `Internet Archive › ${parentFile.replace('.json', '')}`
                                });
                            }
                        });
                    }
                    if (deepFolderMatches.length > 0) {
                        setDeepSearchResults(prev => [...prev, ...deepFolderMatches]);
                    }
                }
            }

            // MODE 2: Deep File Search (Fetches remote JSONs)
            // Only runs if Deep Search is ON AND Target is Files or Both
            if (isDeepSearch && (searchTarget === 'files' || searchTarget === 'both')) {
                // SCAN ENGINE: Loop through all selected providers
                const provsToScan = activeProvider === 'all' ? Object.keys(data.collections) : [activeProvider];

                const processPlatformBatch = async (provider, batch, manifest) => {
                    const results = [];
                    const promises = batch.map(async (tag) => {
                        const platformNode = manifest[tag];
                        if (!platformNode) return;
                        if (activeProvider !== 'all' && activeTag !== 'all' && tag !== activeTag) return;

                        try {
                            let games = [];
                            const cacheKey = `${provider}-${tag}`;
                            if (gameCache[cacheKey]) {
                                games = gameCache[cacheKey];
                            } else {
                                const files = Array.isArray(platformNode.file) ? platformNode.file : [platformNode.file];
                                const fetchPromises = files.map(f => fetch(`${DATA_BASE_URL}/data/${f}`, { signal }).then(r => r.ok ? r.json() : []));
                                const results = await Promise.all(fetchPromises);
                                games = results.flat();
                                setGameCache(prev => ({ ...prev, [cacheKey]: games }));
                            }

                            const matches = games.filter(g => {
                                const name = normalize(g.name);
                                return searchTokens.every(token => name.includes(token));
                            }).map((g, idx) => ({
                                id: `game-${provider}-${tag}-${idx}`,
                                name: g.name ? g.name.replace(/\.zip$|\.7z$/i, '') : 'Unknown',
                                provider: provider,
                                platform: tag,
                                itemData: g,
                                type: 'game'
                            }));
                            results.push(...matches);
                        } catch (err) {
                            if (err.name !== 'AbortError') console.warn(`Skipped ${tag}`, err);
                        }
                    });
                    await Promise.all(promises);
                    return results;
                };

                for (const provider of provsToScan) {
                    if (signal.aborted) break;

                    // Ensure manifest is loaded for this provider
                    let currentManifest = manifests[provider];
                    if (!currentManifest) {
                        try {
                            const mRes = await fetch(`${DATA_BASE_URL}/data/${provider}/_manifest.json`, { signal });
                            if (mRes.ok) {
                                currentManifest = await mRes.json();
                                setManifests(prev => ({ ...prev, [provider]: currentManifest }));
                            }
                        } catch (e) { continue; }
                    }
                    if (!currentManifest) continue;

                    const platformKeys = Object.keys(currentManifest);
                    const BATCH_SIZE = 8;
                    for (let i = 0; i < platformKeys.length; i += BATCH_SIZE) {
                        if (signal.aborted) break;
                        const batchResults = await processPlatformBatch(provider, platformKeys.slice(i, i + BATCH_SIZE), currentManifest);
                        if (batchResults.length > 0) {
                            setDeepSearchResults(prev => [...prev, ...batchResults]);
                        }
                    }
                }
            }

            setIsSearchingDeep(false);
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [searchTerm, isDeepSearch, searchTarget, activeProvider, activeTag, data, platformMap]);


    // Combined Filtered Items
    const filteredItems = useMemo(() => {
        if (!data) return [];

        // CASE 1: Deep Search or Global Targeted Search Active
        if (searchTerm && (isDeepSearch || searchTarget !== 'files')) {
            return deepSearchResults.map(item => ({
                ...item,
                breadcrumb: item.breadcrumb || (item.type === 'game' ? `${item.provider} › ${item.platform}` : `${item.provider}`)
            }));
        }

        // Helper to normalize strings
        const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9\s]/g, '');
        const normalizedTerm = normalize(searchTerm);
        const searchTokens = normalizedTerm.split(/\s+/).filter(Boolean);

        let sourceItems = [];
        let itemType = 'platform';

        // CASE 2: Single Platform View (Browsing Games)
        if (activeProvider !== 'all' && activeTag !== 'all') {
            const cacheKey = `${activeProvider}-${activeTag}`;
            if (gameCache[cacheKey]) {
                sourceItems = gameCache[cacheKey].map((g, idx) => ({
                    id: `${cacheKey}-${idx}`,
                    name: g.name ? g.name.replace(/\.zip$|\.7z$/i, '') : 'Unknown', // Remove extension for display
                    provider: activeProvider,
                    itemData: g, // Store full data (url, size, etc)
                    type: 'game'
                }));
                itemType = 'game';
            }
        }
        // CASE 3: Provider View (Browsing Platforms)
        else {
            Object.entries(data.collections).forEach(([providerKey, providerData]) => {
                if (activeProvider !== 'all' && activeProvider !== providerKey) return;

                providerData.platforms.forEach(platform => {
                    if (activeTag !== 'all' && activeTag !== platform.name) return;

                    sourceItems.push({
                        id: `${providerKey}-${platform.name}`,
                        name: platform.name,
                        provider: providerKey,
                        count: platform.count,
                        type: 'platform'
                    });
                });
            });
        }

        if (!searchTerm) return sourceItems;

        // Shallow Search (Current View Only)
        return sourceItems.filter(item => {
            // Respect the search target even in shallow mode
            if (searchTarget === 'files' && item.type !== 'game') return false;
            if (searchTarget === 'folders' && item.type !== 'platform') return false;

            const textToSearch = item.type === 'game'
                ? normalize(item.name)
                : normalize(item.name + ' ' + item.provider);
            return searchTokens.every(token => textToSearch.includes(token));
        }).sort((a, b) => {
            // Basic Relevance Sorting
            const A = normalize(a.name);
            const B = normalize(b.name);

            // Exact match gets priority
            if (A === normalizedTerm) return -1;
            if (B === normalizedTerm) return 1;

            // Starts with priority
            if (A.startsWith(normalizedTerm) && !B.startsWith(normalizedTerm)) return -1;
            if (B.startsWith(normalizedTerm) && !A.startsWith(normalizedTerm)) return 1;

            return 0;
        });

    }, [data, searchTerm, activeProvider, activeTag, gameCache, isDeepSearch, deepSearchResults, searchTarget]);

    // Unique providers and tags for filters (re-use logic but safe-guard)
    const { providers, tags } = useMemo(() => {
        if (!data) return { providers: [], tags: [] };

        const provs = Object.keys(data.collections);

        let relevantPlatforms = [];

        if (activeProvider === 'all') {
            const tagSet = new Set();
            Object.values(data.collections).forEach(p => {
                p.platforms.forEach(pl => tagSet.add(pl.name));
            });
            relevantPlatforms = Array.from(tagSet).sort();
        } else {
            const pData = data.collections[activeProvider];
            relevantPlatforms = pData ? pData.platforms.map(pl => pl.name).sort() : [];
        }

        return { providers: provs, tags: relevantPlatforms };
    }, [data, activeProvider]);

    const toggleGlobalSearch = () => {
        const newState = !isGlobalSearch;
        setIsGlobalSearch(newState);
        if (newState) {
            setActiveProvider('all');
            setActiveTag('all');
            setIsDeepSearch(true); // Usually global applies deeply
        }
    };

    // Infinite Scroll Logic
    const visibleItems = useMemo(() => {
        return filteredItems.slice(0, visibleCount);
    }, [filteredItems, visibleCount]);

    useEffect(() => {
        // Reset pagination when search or filters change
        setVisibleCount(40);
    }, [searchTerm, activeProvider, activeTag, isGlobalSearch, isDeepSearch, searchTarget]);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setVisibleCount((prev) => prev + 40);
                }
            },
            { rootMargin: '100px' }
        );

        if (loadMoreRef.current) {
            observer.observe(loadMoreRef.current);
        }

        return () => observer.disconnect();
    }, [visibleItems, loadMoreRef]);


    if (loading) return (
        <div className="flex items-center justify-center min-h-screen bg-bg-primary text-white">
            <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
                <p className="text-text-muted animate-pulse">Initializing Database...</p>
            </div>
        </div>
    );

    return (
        <main className="min-h-screen bg-bg-primary text-text-primary p-6 relative overflow-x-hidden font-sans">

            {/* Background Ambient Glow */}
            <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-accent/10 blur-[120px] rounded-full"></div>
                <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-600/10 blur-[120px] rounded-full"></div>
            </div>

            {/* Floating Header / Search Bar */}
            <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${searchTerm ? 'translate-y-0 opacity-100' : 'translate-y-0'}`}>
                <div className="backdrop-blur-xl bg-bg-secondary/80 border-b border-white/5 shadow-lg">
                    <div className="max-w-7xl mx-auto px-6 py-4">

                        <div className="flex flex-col gap-4">
                            {/* Search Input Area */}
                            <div className="flex items-center gap-4 relative bg-white/5 border border-white/10 rounded-2xl p-2 px-4 hover:border-white/20 transition-all shadow-inner">
                                <Search className={`w-5 h-5 ${searchTerm ? 'text-accent' : 'text-text-muted'} transition-colors`} />
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    placeholder={searchTarget === 'folders' ? "Search for Folders (e.g. N64)..." : "Type to search games..."}
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="bg-transparent border-none outline-none text-xl font-medium w-full placeholder:text-text-muted/40 text-white h-10"
                                />

                                {searchTerm && (
                                    <button onClick={() => setSearchTerm('')} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                        <X className="w-5 h-5 text-text-muted" />
                                    </button>
                                )}

                                <div className="hidden md:flex items-center gap-2 text-xs text-text-muted border border-white/10 px-2 py-1 rounded bg-black/20">
                                    <Command className="w-3 h-3" />
                                    <span>ANY KEY</span>
                                </div>
                            </div>

                            {/* Dynamic Filters */}
                            <div className={`flex flex-col gap-2 transition-all duration-300 ${searchTerm || activeProvider !== 'all' ? 'opacity-100 max-h-40' : 'opacity-100 max-h-40'}`}>
                                {/* Provider Navigation (Restored Style) */}
                                <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide border-b border-white/5 mb-4">
                                    <button
                                        onClick={() => {
                                            setActiveProvider('all');
                                            setActiveTag('all');
                                        }}
                                        className={`px-3 py-1 rounded-full text-xs font-bold transition-all border flex items-center gap-2 ${activeProvider === 'all' ? 'bg-accent text-white border-accent' : 'bg-white/5 text-text-muted border-white/5 hover:bg-white/10'}`}
                                    >
                                        <Globe className="w-3 h-3" />
                                        GLOBAL
                                    </button>

                                    {providers.map(p => (
                                        <button
                                            key={p}
                                            onClick={() => {
                                                setActiveProvider(p);
                                                setActiveTag('all');
                                            }}
                                            className={`px-3 py-1 rounded-full text-xs font-medium transition-all border whitespace-nowrap ${activeProvider === p ? 'bg-white text-black border-white' : 'bg-white/5 text-text-muted border-white/5 hover:bg-white/10'}`}
                                        >
                                            {p.replace('_', ' ')}
                                        </button>
                                    ))}
                                </div>

                                {/* Tags Row - HIDDEN FOR REVAMP */}
                                {false && tags.length > 0 && (
                                    <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                        <span className="text-xs font-bold text-text-muted uppercase tracking-wider mr-2">Sub-Folders</span>
                                        <button
                                            onClick={() => setActiveTag('all')}
                                            className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap border ${activeTag === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white/5 text-text-muted border-white/5 hover:bg-white/10'}`}
                                        >
                                            All
                                        </button>
                                        {tags.slice(0, 100).map(t => (
                                            <button
                                                key={t}
                                                onClick={() => setActiveTag(t)}
                                                className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap border ${activeTag === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white/5 text-text-muted border-white/5 hover:bg-white/10'}`}
                                            >
                                                {t}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>
                </div>
            </header>

            {/* Spacer for fixed header */}
            <div className="h-40"></div>

            {/* Breadcrumbs / Search Info */}
            <div className="max-w-7xl mx-auto mb-4">
                <div className="flex flex-col gap-4">

                    {/* Breadcrumbs */}
                    <div className="flex items-center gap-2 text-sm text-text-muted overflow-x-auto whitespace-nowrap pb-2 scrollbar-hide">
                        <button
                            onClick={() => { setActiveProvider('all'); setActiveTag('all'); }}
                            className="hover:text-white flex items-center gap-1 transition-colors"
                        >
                            <HomeIcon className="w-4 h-4" />
                            Home
                        </button>

                        {activeProvider !== 'all' && (
                            <>
                                <ChevronRight className="w-4 h-4 opacity-50" />
                                <button
                                    onClick={() => setActiveTag('all')}
                                    className={`hover:text-white transition-colors ${activeTag === 'all' ? 'text-white font-medium' : ''}`}
                                >
                                    {activeProvider}
                                </button>
                            </>
                        )}

                        {activeTag !== 'all' && (
                            <>
                                <ChevronRight className="w-4 h-4 opacity-50" />
                                <span className="text-white font-medium">
                                    {activeTag}
                                </span>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="max-w-7xl mx-auto">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
                    <h2 className="text-xl text-text-secondary font-medium flex items-center gap-3">
                        {searchTerm ? `Searching for "${searchTerm}"` : (activeTag !== 'all' ? activeTag : (activeProvider !== 'all' ? activeProvider : 'All Collections'))}
                        <span className="text-sm text-text-muted bg-white/5 px-2 py-0.5 rounded-md">
                            {filteredItems.length} items
                        </span>
                    </h2>

                    {/* ... (Search Toggles kept from previous step) ... */}
                    {/* Search Toggles */}
                    <div className="flex items-center gap-3">
                        {/* Deep Search Toggle */}
                        <div className="relative group">
                            <button
                                onClick={() => setIsDeepSearch(!isDeepSearch)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all border ${isDeepSearch ? 'bg-purple-500/20 border-purple-500 text-purple-400 font-bold' : 'bg-white/5 border-white/5 text-text-muted hover:bg-white/10'}`}
                            >
                                <Filter className="w-4 h-4" />
                                {isDeepSearch ? 'Deep Search ON' : 'Deep Search OFF'}
                            </button>
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1 bg-black/90 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                                {isDeepSearch ? 'Scope: Scanning all files in archive' : 'Scope: Searching current list only'}
                            </div>
                        </div>

                        {/* Search Target Toggle (Triple Mode) */}
                        <div className="flex items-center bg-white/5 rounded-lg border border-white/10 p-1">
                            {['files', 'folders', 'both'].map((mode) => (
                                <button
                                    key={mode}
                                    onClick={() => setSearchTarget(mode)}
                                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all uppercase tracking-wider ${searchTarget === mode
                                        ? (mode === 'both' ? 'bg-accent text-white shadow-lg' : 'bg-blue-600 text-white shadow-lg')
                                        : 'text-text-muted hover:text-white'}`}
                                >
                                    {mode}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Deep Search Progress Indicator */}
                {isSearchingDeep && (
                    <div className="flex items-center justify-center gap-3 mb-6 p-4 bg-accent/10 border border-accent/20 rounded-xl text-accent animate-pulse shadow-xl backdrop-blur-md">
                        <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
                        <div className="flex flex-col">
                            <span className="font-bold text-sm">Deep Scan in Progress...</span>
                            <span className="text-xs opacity-70">Searching through thousands of {searchTarget} across the archive. Found {filteredItems.length} so far.</span>
                        </div>
                    </div>
                )}

                {loadingGames ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mb-4"></div>
                        <p className="text-text-muted animate-pulse">Loading games...</p>
                    </div>
                ) : filteredItems.length === 0 && !isSearchingDeep ? (
                    <div className="flex flex-col items-center justify-center py-20 text-text-muted">
                        <Disc className="w-16 h-16 opacity-20 mb-4" />
                        <p>No items found matching your criteria.</p>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                            {visibleItems.map((item) => (
                                <div
                                    key={item.id}
                                    onClick={() => {
                                        if (item.type === 'platform' || item.type === 'folder') {
                                            setActiveProvider(item.provider);
                                            setActiveTag(item.name);
                                            setSearchTerm('');
                                            setSearchTarget('files'); // Reset to files on entry
                                            window.scrollTo({ top: 0, behavior: 'smooth' });
                                        } else {
                                            // Handle Game Click - Use Proxy for Direct Download
                                            window.location.href = `/api/download?url=${encodeURIComponent(item.itemData.url)}`;
                                        }
                                    }}
                                    className="group relative bg-bg-card border border-white/5 hover:border-accent/50 rounded-xl p-4 transition-all hover:translate-y-[-2px] hover:shadow-lg hover:shadow-accent/10 cursor-pointer overflow-hidden animate-in fade-in zoom-in duration-500"
                                >
                                    <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <div className="bg-accent rounded-full p-1.5">
                                            {(item.type === 'platform' || item.type === 'folder') ? <Folder className="w-3 h-3 text-white" /> : <File className="w-3 h-3 text-white" />}
                                        </div>
                                    </div>

                                    <div className="flex flex-col h-full">
                                        <div className="mb-3">
                                            <span className={`text-xs font-mono px-2 py-0.5 rounded ${(item.type === 'platform' || item.type === 'folder') ? 'text-accent bg-accent/10' : 'text-green-400 bg-green-500/10'}`}>
                                                {(item.type === 'platform' || item.type === 'folder') ? 'COLLECTION' : 'FILE'}
                                            </span>
                                        </div>
                                        <h3 className="text-lg font-semibold text-text-primary mb-1 line-clamp-2 leading-tight group-hover:text-accent transition-colors">
                                            {item.name}
                                        </h3>
                                        <div className="mt-auto pt-4 flex flex-col gap-2">
                                            {item.breadcrumb && (
                                                <div className="text-[10px] font-medium text-text-muted/60 uppercase tracking-tighter truncate">
                                                    {item.breadcrumb}
                                                </div>
                                            )}
                                            <div className="flex items-center justify-between text-xs text-text-muted">
                                                {(item.type === 'platform' || item.type === 'folder') ? (
                                                    <span className="flex items-center gap-1">
                                                        <Folder className="w-3 h-3" />
                                                        {item.count ? item.count.toLocaleString() : '?'} Items
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1">
                                                        <Disc className="w-3 h-3" />
                                                        {item.itemData.size}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Load More Sentinel */}
                        {visibleItems.length < filteredItems.length && (
                            <div ref={loadMoreRef} className="py-8 flex justify-center w-full">
                                <div className="w-6 h-6 border-2 border-white/20 border-t-accent rounded-full animate-spin"></div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Footer */}
            <footer className="mt-20 py-10 border-t border-white/5 text-center text-text-muted text-sm">
                <p>© 2026 Myrient Explorer. <span className="opacity-50">Press 'K' or start typing to search.</span></p>
            </footer>

        </main>
    );
}
