// Toast: Accessible output element for status messages
export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
    return (
        <output aria-live="polite" className="toast">
            {message}
            <button aria-label="Close" onClick={onClose}>
                ×
            </button>
        </output>
    )
}

// Header: App bar with optional search
export function Header({ title, onSearch }: { title: string; onSearch?: (q: string) => void }) {
    return (
        <header className="ha-header">
            <h1>{title}</h1>
            {onSearch && (
                <input
                    aria-label="Search artists"
                    className="ha-search"
                    type="search"
                    placeholder="Search artists..."
                    onInput={e => onSearch((e.target as any).value)}
                />
            )}
        </header>
    )
}

// ArtistCard: Card for an artist
export function ArtistCard({ artist, onPlay }: { artist: { id: string; name: string; image: string }; onPlay: (artist: any) => void }) {
    return (
        <button
            className="artist-card"
            aria-label={`Play ${artist.name}`}
            onClick={() => onPlay(artist)}
        >
            <img src={artist.image} alt={artist.name} className="artist-img" />
            <span className="artist-name">{artist.name}</span>
        </button>
    )
}

// ArtistGrid: Responsive grid of artist cards
export function ArtistGrid({ artists, onPlay }: { artists: { id: string; name: string; image: string }[]; onPlay: (artist: any) => void }) {
    return (
        <div className="artist-grid">
            {artists.map(artist => (
                <ArtistCard key={artist.id} artist={artist} onPlay={onPlay} />
            ))}
        </div>
    )
}

// ArtistList: List of artists with edit/delete
export function ArtistList({ artists, onEdit, onDelete }: {
    artists: { id: string; name: string }[];
    onEdit: (artist: any) => void;
    onDelete: (artist: any) => void;
}) {
    return (
        <ul className="artist-list">
            {artists.map(artist => (
                <li key={artist.id}>
                    <span>{artist.name}</span>
                    <button aria-label={`Edit ${artist.name}`} onClick={() => onEdit(artist)}>Edit</button>
                    <button aria-label={`Delete ${artist.name}`} onClick={() => onDelete(artist)}>Delete</button>
                </li>
            ))}
        </ul>
    )
}
