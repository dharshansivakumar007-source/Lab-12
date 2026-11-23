# NOVA technology storefront

A responsive, front-end-only technology shopping demo built with HTML, CSS, JavaScript, and an XML product catalogue. The catalogue contains 37 illustrative electronics products across eight categories.

## Run locally

The browser loads `products.xml` with `fetch`, so open the project through a local web server rather than opening `index.html` directly.

1. Open this folder in VS Code.
2. Start the project with the **Live Server** extension (right-click `index.html` and choose **Open with Live Server**) or another local HTTP server.
3. Browse the local address opened by the server.

The XML catalogue is fetched by JavaScript, so `file://` access is not supported.

## Project files

- `index.html` — homepage, category navigation, and featured collections
- `products.html`, `product.html` — searchable catalogue and product details
- `cart.html`, `checkout.html`, `order-success.html` — demo shopping flow
- `login.html`, `register.html`, `account.html`, `wishlist.html` — demo customer pages
- `contact.html`, `404.html` — support and not-found pages
- `products.xml` — 37 sample technology products and specifications
- `app.js` — shared product loading and storefront interactions
- `styles.css` — shared visual styles and responsive layouts

## Demo-only behavior

Cart, wishlist, theme, profile, contact messages, and demo orders are saved in this browser's `localStorage`. Demo authentication does not save passwords and is not secure. Checkout does not collect payment details, process payments, or send orders to a server. UPI and cash-on-delivery are interface demonstrations only.

Product names, prices, discounts, ratings, review counts, specifications, availability, and images are sample data and are not verified offers or live inventory. Product photography is loaded from Unsplash; product and brand names may be trademarks of their respective owners.
