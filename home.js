<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>The Oklahoma Observer</title>

    <!-- Favicon (fixed) -->
    <link rel="icon" href="./icon.png" />

    <meta name="theme-color" content="#1E90FF" />
    <link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet" />

    <!-- Cache-busted CSS so the layout/headers/cards render correctly -->
    <link rel="stylesheet" href="./app.css?v=2.6.3" />
    <link rel="stylesheet" href="./detail.css?v=2.6.3" />

    <meta name="description" content="The Oklahoma Observer — To Comfort The Afflicted And Afflict The Comfortable." />
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
    <meta http-equiv="Pragma" content="no-cache" />
    <meta http-equiv="Expires" content="0" />
  </head>
  <body>
    <header id="main-header" class="site-header">
      <div class="header-inner">
        <img src="./Observer-logo[1].png" alt="Oklahoma Observer Logo" class="site-logo logo-img" />
        <div class="motto">To Comfort The Afflicted And Afflict The Comfortable</div>

        <nav class="menu">
          <a href="#/" class="nav-link">Posts</a>
          <a href="#/about" class="nav-link">About</a>
        </nav>

        <button id="menu-toggle" aria-label="Menu">
          <span class="bar"></span><span class="bar"></span><span class="bar"></span>
        </button>
      </div>
    </header>

    <main id="app">
      <div class="loading">Loading…</div>
    </main>

    <footer id="main-footer">
      <p>&copy; <span id="year"></span> The Oklahoma Observer. All Rights Reserved.</p>
    </footer>

    <!-- Cache-busted entry; imports core-fixed.js internally -->
    <script type="module" src="./main.js?v=2.6.2"></script>

    <script>
      // Footer year + mobile menu toggle
      document.getElementById("year").textContent = new Date().getFullYear();
      document.getElementById("menu-toggle").addEventListener("click", function () {
        document.querySelector(".menu").classList.toggle("open");
      });

      // Ensure the service worker is active (for fast repeat loads)
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("./sw.js").catch(console.warn);
      }
    </script>
  </body>
</html>
