# v56 – Spotify Host Play Fix

Behebt `musicPlayer.play is not a function`: Der Spotify Web Playback SDK Player besitzt keine `play()`-Methode. Beim Start eines neuen Tracks wird deshalb die offizielle Spotify Web API `/v1/me/player/play` über den vorhandenen Server-Endpunkt `/api/spotify/play` mit der aktuellen Web-Playback-Device-ID aufgerufen. Danach übernimmt der SDK-Player für Pause, Resume, Seek und Lautstärke.
