const dialog = document.querySelector("#collectionDialog");
document.querySelector("#newCollection").addEventListener("click", () => dialog.showModal());
document.querySelector("#configButton").addEventListener("click", () => dialog.showModal());
document.querySelectorAll(".row-button, .idea-footer button, .text-button").forEach((button) => {
  button.addEventListener("click", () => dialog.showModal());
});
document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((link) => link.classList.remove("active"));
    item.classList.add("active");
  });
});

