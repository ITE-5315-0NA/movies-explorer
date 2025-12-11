

async function loadWatchlist() {
  const root = document.getElementById('watchlist-root');
  const emptyMsg = document.getElementById('watchlist-empty');
  const errorMsg = document.getElementById('watchlist-error');

  root.innerHTML = '';
  emptyMsg.style.display = 'none';
  errorMsg.style.display = 'none';

  const token = localStorage.getItem('jwt');
  if (!token) {
    errorMsg.textContent = 'You must be logged in to see your watchlist.';
    errorMsg.style.display = 'block';
    return;
  }

  try {
    const res = await fetch('/api/watchlist', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!res.ok) {
      throw new Error('Failed to load watchlist');
    }

    const items = await res.json();

    if (!items.length) {
      emptyMsg.style.display = 'block';
      return;
    }

    items.forEach(item => {
      const col = document.createElement('div');
      col.className = 'col-md-3';

      col.innerHTML = `
        <div class="card border-0 shadow-sm h-100 bg-slate-900">
          ${
            item.poster_url
              ? `<img src="${item.poster_url}" class="card-img-top" alt="${item.movieTitle || 'Movie'}">`
              : `<div class="ratio ratio-2x3 d-flex align-items-center justify-content-center bg-dark text-light">
                   <span>${item.movieTitle || 'Movie'}</span>
                 </div>`
          }
          <div class="card-body d-flex flex-column">
            <h5 class="card-title">${item.movieTitle || 'Movie'}</h5>
            <p class="card-text text-muted mb-2">
              Status: <span class="badge bg-info text-dark">${item.status || 'planned'}</span>
            </p>
            <button class="btn btn-outline-danger mt-auto"
                    data-id="${item._id}">
              Remove
            </button>
          </div>
        </div>
      `;

      root.appendChild(col);
    });

    root.addEventListener(
      'click',
      async (e) => {
        if (e.target.tagName === 'BUTTON' && e.target.dataset.id) {
          const id = e.target.dataset.id;
          await deleteWatchlistItem(id, e.target.closest('.col-md-3'));
        }
      },
      { once: true }
    );
  } catch (err) {
    console.error(err);
    errorMsg.style.display = 'block';
  }
}

async function deleteWatchlistItem(id, cardElement) {
  const token = localStorage.getItem('jwt');
  if (!token) return;

  if (!confirm('Remove this movie from your watchlist?')) return;

  try {
    const res = await fetch(`/api/watchlist/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!res.ok) {
      throw new Error('Failed to delete');
    }

    cardElement.remove();
  } catch (err) {
    console.error(err);
    alert('Could not remove item. Please try again.');
  }
}

document.addEventListener('DOMContentLoaded', loadWatchlist);
