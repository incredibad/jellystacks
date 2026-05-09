import json
import re

STOP_WORDS = {
    "the", "a", "an", "of", "and", "or", "in", "on", "at", "to", "for",
    "with", "by", "from", "movies", "films", "collection", "cinema", "film",
    "movie", "my", "best", "all", "top", "great", "good", "favorites",
    "favourites", "picks", "watch", "list",
}

# Single words that appear in almost any movie's overview/title — penalise when
# matched in low-signal fields so they don't pollute the results.
COMMON_WORDS = {
    "time", "love", "man", "men", "woman", "women", "life", "day", "night",
    "world", "new", "old", "big", "little", "long", "small", "high", "low",
    "last", "first", "dark", "black", "white", "red", "blue", "dead", "war",
    "city", "home", "story", "tales", "adventure", "epic", "young", "old",
    "fight", "battle", "hero", "family", "power", "force",
}

WEIGHTS = {
    "director": 6,
    "person": 5,
    "tag_phrase": 4,
    "tag_word": 3,
    "genre": 3,
    "title_phrase": 2,
    "title_word": 1.5,
    "overview_phrase": 1,
    "overview_word": 0.5,
    "year_range": 2,
}

SYNONYMS: dict[str, list[str]] = {
    "time travel": ["time loop", "time machine"],
    "time loop": ["time travel"],
    "kung fu": ["martial arts", "wuxia", "karate", "kung-fu"],
    "kung-fu": ["martial arts", "wuxia", "karate", "kung fu"],
    "martial arts": ["kung fu", "wuxia", "karate", "kung-fu"],
    "zombie": ["undead", "living dead"],
    "zombies": ["undead", "living dead"],
    "rom-com": ["romantic comedy"],
    "romcom": ["romantic comedy"],
    "sci-fi": ["science fiction"],
    "scifi": ["science fiction"],
    "science fiction": ["sci-fi"],
    "heist": ["caper"],
    "superhero": ["comic book", "superheroes"],
    "superheroes": ["comic book", "superhero"],
    "anime": ["animation", "animated"],
    "dystopian": ["post-apocalyptic", "dystopia"],
    "dystopia": ["post-apocalyptic", "dystopian"],
    "disaster": ["natural disaster", "catastrophe"],
    "christmas": ["holiday", "xmas", "festive"],
    "holiday": ["christmas", "festive"],
    "psychological": ["mind", "psychological thriller"],
    "bollywood": ["hindi", "indian cinema"],
}


def _tokenise(name: str) -> tuple[list[str], list[str]]:
    """Return (unigrams, bigrams) from a collection name, filtering stop words.

    Also expands synonyms so e.g. "time travel" also matches "time loop" tags.
    """
    cleaned = re.sub(r"[^\w\s-]", " ", name.lower())
    raw_words = cleaned.split()
    unigrams = [w for w in raw_words if w not in STOP_WORDS and len(w) > 1]

    bigrams: list[str] = []
    for i in range(len(raw_words) - 1):
        bigrams.append(f"{raw_words[i]} {raw_words[i + 1]}")

    expanded_unigrams = list(unigrams)
    expanded_bigrams = list(bigrams)

    for bigram in list(bigrams):
        for syn in SYNONYMS.get(bigram, []):
            if " " in syn:
                if syn not in expanded_bigrams:
                    expanded_bigrams.append(syn)
            else:
                if syn not in expanded_unigrams:
                    expanded_unigrams.append(syn)

    for uni in list(unigrams):
        for syn in SYNONYMS.get(uni, []):
            if " " in syn:
                if syn not in expanded_bigrams:
                    expanded_bigrams.append(syn)
            else:
                if syn not in expanded_unigrams:
                    expanded_unigrams.append(syn)

    return expanded_unigrams, expanded_bigrams


def _parse_year_range(tokens: list[str]) -> tuple[int, int] | None:
    for token in tokens:
        # "1980s" or "1980"
        m = re.match(r"^(\d{4})s?$", token)
        if m:
            year = int(m.group(1))
            return (year, year + 9) if token.endswith("s") else (year, year)
        # "80s", "90s", "00s"
        m = re.match(r"^(\d{2})s$", token)
        if m:
            prefix = int(m.group(1))
            decade = (1900 + prefix) if prefix >= 20 else (2000 + prefix)
            return (decade, decade + 9)
    return None


def score_movie(movie, unigrams: list[str], bigrams: list[str], year_range) -> float:
    score = 0.0

    tags = json.loads(movie.tags or "[]")
    genres = json.loads(movie.genres or "[]")
    people = json.loads(movie.people or "[]")
    overview = (movie.overview or "").lower()
    title = movie.title.lower()

    tags_lower = [t.lower() for t in tags]
    genres_lower = [g.lower() for g in genres]

    director_names = {p["name"].lower() for p in people if p.get("type") == "Director"}
    all_people_names = " ".join(p["name"].lower() for p in people)

    # ── People ──────────────────────────────────────────────────────────────────
    for term in bigrams + unigrams:
        if any(term in name for name in director_names):
            score += WEIGHTS["director"]
        elif term in all_people_names:
            score += WEIGHTS["person"]

    # ── Tags ────────────────────────────────────────────────────────────────────
    for term in bigrams:
        if any(term in tag for tag in tags_lower):
            score += WEIGHTS["tag_phrase"]
    for term in unigrams:
        if term in COMMON_WORDS:
            continue
        if any(term == tag or term in tag.split() for tag in tags_lower):
            score += WEIGHTS["tag_word"]

    # ── Genres ──────────────────────────────────────────────────────────────────
    all_genres = " ".join(genres_lower)
    for term in bigrams + unigrams:
        if term in COMMON_WORDS:
            continue
        if term in all_genres:
            score += WEIGHTS["genre"]

    # ── Title ───────────────────────────────────────────────────────────────────
    for term in bigrams:
        if term in title:
            score += WEIGHTS["title_phrase"]
    for term in unigrams:
        if term not in COMMON_WORDS and term in title:
            score += WEIGHTS["title_word"]

    # ── Overview ────────────────────────────────────────────────────────────────
    for term in bigrams:
        if term in overview:
            score += WEIGHTS["overview_phrase"]
    for term in unigrams:
        if term not in COMMON_WORDS and term in overview:
            score += WEIGHTS["overview_word"]

    # ── Year range ──────────────────────────────────────────────────────────────
    if year_range and movie.year:
        if year_range[0] <= movie.year <= year_range[1]:
            score += WEIGHTS["year_range"]

    return score
