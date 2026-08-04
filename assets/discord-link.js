(function (global) {
  var WIDGET_URL = "https://canary.discord.com/api/guilds/1534277254383927378/widget.json";
  var STATIC_INVITE = "https://discord.gg/EXpgrAJh";
  var ONLINE_THRESHOLD = 25;
  var LINK_SELECTOR = 'a[href="' + STATIC_INVITE + '"]';

  function wireDiscordLinks() {
    var links = document.querySelectorAll(LINK_SELECTOR);
    if (!links.length) return;

    fetch(WIDGET_URL)
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (data) {
        var invite = data && (data.instant_invite || data.invite_url);
        if (data && typeof data.presence_count === "number" && data.presence_count >= ONLINE_THRESHOLD) {
          var count = document.getElementById("discord-count");
          if (count) {
            count.textContent = " (" + data.presence_count + " online)";
          }
        }
        if (!invite) return;
        links.forEach(function (link) {
          link.href = invite;
        });
      })
      .catch(function () {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireDiscordLinks);
  } else {
    wireDiscordLinks();
  }
})(window);